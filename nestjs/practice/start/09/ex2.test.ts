// 練習 2：@Timeout(ms) 與 TimeoutInterceptor
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Controller, Get, Module, type INestApplication } from '@nestjs/common'
import request from 'supertest'
import { setTimeout as sleep } from 'node:timers/promises'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import { DeliveryClient } from './src/delivery/delivery.client.js'
import { ReportsService } from './src/reports/reports.service.js'

const decorator = await import('./src/timeout.decorator.js').catch(() => undefined) as { Timeout?: (ms: number) => MethodDecorator & ClassDecorator } | undefined

// 測試自己加的 controller：不在你的程式裡，只有全域註冊的 interceptor 管得到它
@Controller('test-only')
class SlowController {
  async slow() { await sleep(1000); return { ok: true } }
  @Get('fast')
  fast() { return { ok: true } }
}
Get('slow')(SlowController.prototype, 'slow', Object.getOwnPropertyDescriptor(SlowController.prototype, 'slow')!)
if (typeof decorator?.Timeout === 'function') decorator.Timeout(100)(SlowController.prototype, 'slow', Object.getOwnPropertyDescriptor(SlowController.prototype, 'slow')!)

// 整個 controller 貼 @Timeout(100)：路由上沒標，要讀到 controller 上的值
@Controller('test-class')
class SlowClassController {
  @Get('slow')
  async slow() { await sleep(1000); return { ok: true } }
}
if (typeof decorator?.Timeout === 'function') decorator.Timeout(100)(SlowClassController)

@Module({ imports: [AppModule], controllers: [SlowController, SlowClassController] })
class TestModule {}

let delivery = 0
let report = 0
let app: INestApplication
beforeAll(async () => {
  app = await createTestApp(TestModule, {
    override: b => b
      .overrideProvider(DeliveryClient).useValue({ eta: async (orderId: number) => { await sleep(delivery); return { orderId, minutes: 25 } } })
      .overrideProvider(ReportsService).useValue({ daily: async () => { await sleep(report); return { orders: 1, revenue: 290 } } }),
  })
  await request(app.getHttpServer()).get('/test-only/fast')   // 先暖機：第一個請求比較慢，不要算進逾時的量測
})
afterAll(() => app?.close())
const http = () => request(app.getHttpServer())

async function timed(path: string) {
  const t = performance.now()
  const res = await http().get(path)
  return { res, ms: performance.now() - t }
}

describe('練習 2：逾時', () => {
  it('src/timeout.decorator.ts 匯出 Timeout 裝飾器', () => {
    expect(decorator?.Timeout, '找不到 Timeout：在 src/timeout.decorator.ts 寫 export const Timeout = Reflector.createDecorator<number>()').toBeTypeOf('function')
  })

  it('@Timeout(100) 的路由跑了 1000ms：100ms 左右就回 503，errorCode 是 TIMEOUT', async () => {
    const { res, ms } = await timed('/test-only/slow')
    expect(res.status, '超過 @Timeout 的時間要回 503 Service Unavailable：catchError 裡遇到 TimeoutError 就丟 new ServiceUnavailableException(…, { errorCode: \'TIMEOUT\' })；只在 handler 裡 Promise.race 的話，測試自己加的路由不會逾時').toBe(503)
    expect(res.body.errorCode, '503 的回應要帶 errorCode: \'TIMEOUT\'，前端才知道可以稍後重試').toBe('TIMEOUT')
    expect(ms, '要在 100ms 左右就回應，不能等 handler 跑完：用 RxJS 的 timeout(ms)，ms 從 @Timeout 讀（reflector.getAllAndOverride）').toBeLessThan(600)
  })

  it('逾時的 503 回應也有 Server-Timing（練習 1 的計時要包在逾時外面）', async () => {
    const res = await http().get('/test-only/slow')
    expect(res.status, '@Timeout(100) 的路由要回 503').toBe(503)
    expect(res.headers['server-timing'], '逾時的 503 沒有 Server-Timing：全域 interceptor 依登記順序由外往內包，APP_INTERCEPTOR 要先登記 TimingInterceptor、再登記 TimeoutInterceptor').toMatch(/^app;dur=\d+(\.\d+)?$/)
  })

  it('@Timeout 貼在 controller 上也有效', async () => {
    const { res, ms } = await timed('/test-class/slow')
    expect(res.status, '@Timeout(100) 貼在整個 controller 上，路由沒標：要用 reflector.getAllAndOverride(Timeout, [context.getHandler(), context.getClass()]) 同時讀路由和 controller').toBe(503)
    expect(ms, 'controller 上的 @Timeout(100)：要在 100ms 左右就回應').toBeLessThan(600)
  })

  it('沒有逾時的路由不受影響', async () => {
    const res = await http().get('/test-only/fast')
    expect(res.status, '很快的路由照常回 200').toBe(200)
    expect(res.body, '回應內容不能被改掉').toEqual({ ok: true })
  })

  it('GET /deliveries/:orderId/eta 最多等 1 秒', async () => {
    delivery = 600
    const ok = await http().get('/deliveries/7/eta')
    expect(ok.status, '外送平台 600ms 回應，還在 1 秒內，要回 200：@Timeout 的時間太短了').toBe(200)
    expect(ok.body, '回應是外送平台給的資料').toEqual({ orderId: 7, minutes: 25 })
    delivery = 1600
    const { res, ms } = await timed('/deliveries/7/eta')
    expect(res.status, '外送平台卡了 1.6 秒：在 eta() 上貼 @Timeout(1000)，1 秒就回 503').toBe(503)
    expect(ms, '要在 1 秒左右回應，不能等到 1.6 秒').toBeLessThan(1450)
    expect(ms, '不能太早放棄：@Timeout(1000) 是 1000 毫秒').toBeGreaterThanOrEqual(950)
  })

  it('沒有 @Timeout 的路由預設等 3000ms', async () => {
    report = 1500
    const ok = await http().get('/reports/daily')
    expect(ok.status, '報表 1.5 秒算完：沒有 @Timeout 的路由預設等 3000ms，要回 200').toBe(200)
    report = 3600
    const { res, ms } = await timed('/reports/daily')
    expect(res.status, '報表跑了 3.6 秒：超過預設的 3000ms 要回 503').toBe(503)
    expect(ms, '預設是 3000ms：太早或太晚回應都不對').toBeGreaterThanOrEqual(2950)
    expect(ms, '預設是 3000ms，不能等到 3.6 秒').toBeLessThan(3450)
  }, 15_000)

  it('其他錯誤原樣往外丟：404、409 不能變成 503', async () => {
    const missing = await http().get('/products/999')
    expect(missing.status, 'GET /products/999 還是 404：catchError 只轉換 TimeoutError，其他錯誤用 throwError(() => err) 原樣丟出').toBe(404)
    expect(missing.body.errorCode, '404 的 errorCode 還是 PRODUCT_NOT_FOUND').toBe('PRODUCT_NOT_FOUND')
    const order = await http().post('/orders').send({ customerId: 1, items: [{ productId: 6, qty: 10, size: 'M' }] })
    expect(order.status, '庫存不足還是 409：不要把所有錯誤都換成 503').toBe(409)
    expect(order.body.errorCode, '409 的 errorCode 還是 OUT_OF_STOCK').toBe('OUT_OF_STOCK')
  })
})
