// 練習 1：同一個請求的每一行 log 都帶同一個 requestId，service 維持 singleton
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger, type INestApplication } from '@nestjs/common'
import request from 'supertest'
import { Redis } from 'ioredis'
import { AppModule } from './src/app.module.js'
import { configureApp } from './src/app.setup.js'
import { OrdersService } from './src/orders/orders.service.js'
import { PaymentGateway } from './src/orders/payment.gateway.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { ReceiptsProcessor } from './src/receipts/receipts.processor.js'
import { ReceiptsProducer } from './src/receipts/receipts.producer.js'
import { RequestContext } from './src/logging/request-context.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

type Line = { level?: string; message?: unknown; context?: string; requestId?: unknown; params?: Record<string, unknown>; [k: string]: unknown }

async function wipeRedis() {
  const redis = new Redis(process.env.REDIS_URL!)
  const keys = await redis.keys(`${process.env.REDIS_PREFIX}*`)
  if (keys.length) await redis.del(...keys)
  redis.disconnect()
}

// 攔下 AppLogger 寫到 stdout 的每一行（json 模式用 process.stdout.write）
let lines: Line[] = []
let raw: string[] = []
const realWrite = process.stdout.write.bind(process.stdout)
function capture() {
  lines = []
  raw = []
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    for (const text of String(chunk).split('\n').filter(Boolean)) {
      raw.push(text)
      try { lines.push(JSON.parse(text)) } catch { /* 不是 JSON 的行 */ }
    }
    return true
  }) as typeof process.stdout.write)
}
const orderIdOf = (l: Line) => (l.params?.orderId ?? l.orderId) as number | undefined

let app: INestApplication
let prisma: PrismaService
beforeAll(async () => {
  await wipeRedis()
  app = await createTestApp(AppModule, {
    configure: configureApp,
    options: { bufferLogs: true },
    override: b => b
      .overrideProvider(ReceiptsProcessor).useValue({})                     // 這一題不讓 worker 取走工作
      .overrideProvider(PaymentGateway).useValue({ charge: async (id: number) => ({ chargeId: `ch_${id}` }) }),   // 付款不用等 1 秒
  })
  prisma = app.get(PrismaService)
})
afterAll(async () => {
  vi.restoreAllMocks()
  await app?.close()
})
beforeEach(async () => {
  await resetDb(prisma)
  await prisma.customer.create({ data: { name: '王小明', email: 'ming@example.com' } })
})

describe('練習 1：requestId 串起同一個請求的 log', () => {
  it('RequestContext：run 裡面（含 await 之後）讀得到 requestId，外面讀不到', async () => {
    const ctx = app.get(RequestContext)
    expect(ctx.requestId, '情境外讀 requestId 要是 undefined').toBeUndefined()
    const seen = await ctx.run('abc', async () => {
      const before = ctx.requestId
      await new Promise(r => setTimeout(r, 5))
      return [before, ctx.requestId]
    })
    expect(seen, "run('abc', fn) 裡面讀 requestId 要是 'abc'，await 之後也一樣：用 AsyncLocalStorage 的 run").toEqual(['abc', 'abc'])
    expect(ctx.requestId, 'run 結束後回到情境外，requestId 要是 undefined').toBeUndefined()
  })

  it('AppLogger 輸出 JSON，請求裡的每一行最上層都有 requestId，跟回應的 X-Request-Id 一樣', async () => {
    capture()
    const res = await request(app.getHttpServer()).post('/orders').send({ customerId: 1, total: 190 })
    const pay = await request(app.getHttpServer()).post(`/orders/${res.body.id}/pay`).set('X-Request-Id', 'pay-req-1')
    vi.mocked(process.stdout.write).mockRestore()
    expect(res.status, 'POST /orders 要 201').toBe(201)
    expect(pay.status, 'POST /orders/:id/pay 要 200').toBe(200)
    expect(lines.length, `沒有攔到任何 JSON log。AppLogger 要用 json: true，攔到的輸出：\n${raw.slice(0, 5).join('\n')}`).toBeGreaterThan(0)

    const created = lines.find(l => l.message === '訂單建立')
    expect(created, '找不到 OrdersService 的「訂單建立」那一行').toBeDefined()
    expect(created!.requestId, 'OrdersService 的 log 最上層要有 requestId，值是這個請求的 X-Request-Id').toBe(res.headers['x-request-id'])
    expect(created!.params, 'orderId、total 要留在 params 裡（不要拼進訊息字串）').toMatchObject({ orderId: res.body.id, total: 190 })

    const paid = lines.find(l => l.message === '付款完成')
    const queued = lines.find(l => l.message === '收據工作已排入')
    expect(paid?.requestId, '「付款完成」要帶付款請求的 requestId（pay-req-1）').toBe('pay-req-1')
    expect(queued?.requestId, 'ReceiptsProducer 的「收據工作已排入」也要帶 pay-req-1：requestId 不是用參數傳的，任何深度的 service 都讀得到').toBe('pay-req-1')
  })

  it('同時進來的請求不會拿到彼此的 requestId', async () => {
    const ids = Array.from({ length: 6 }, (_, i) => `concurrent-${i}`)
    capture()
    const created = await Promise.all(ids.map(id => request(app.getHttpServer()).post('/orders').set('X-Request-Id', id).send({ customerId: 1, total: 80 })))
    const paid = await Promise.all(created.map((r, i) => request(app.getHttpServer()).post(`/orders/${r.body.id}/pay`).set('X-Request-Id', `${ids[i]}-pay`)))
    vi.mocked(process.stdout.write).mockRestore()
    expect(paid.every(r => r.status === 200), '付款請求都要 200').toBe(true)

    const expected = new Map<number, string>()
    created.forEach((r, i) => expected.set(r.body.id, ids[i]))
    for (const message of ['訂單建立', '付款完成', '收據工作已排入']) {
      const found = lines.filter(l => l.message === message)
      expect(found.length, `應該有 6 行「${message}」`).toBe(6)
      for (const l of found) {
        const want = message === '訂單建立' ? expected.get(orderIdOf(l)!) : `${expected.get(orderIdOf(l)!)}-pay`
        expect(l.requestId, `訂單 ${orderIdOf(l)} 的「${message}」帶到別的請求的 requestId：不能用模組層級的變數存「目前的 id」，要用 AsyncLocalStorage`).toBe(want)
      }
    }
  })

  it('請求以外的 log 不帶 requestId', () => {
    capture()
    new Logger('Startup').log('請求以外')
    vi.mocked(process.stdout.write).mockRestore()
    const line = lines.find(l => l.message === '請求以外')
    expect(line, `new Logger(…).log() 要經過 AppLogger 印成 JSON，攔到的輸出：\n${raw.join('\n')}`).toBeDefined()
    expect(line!.requestId, '請求以外沒有 requestId：不要印出空字串或上一個請求的 id').toBeUndefined()
  })

  it('OrdersService、ReceiptsProducer 還是 singleton（沒有變成 request scope）', () => {
    expect(() => app.get(OrdersService), 'app.get(OrdersService) 丟錯：它變成 request scope 了。不要注入 request-scoped 的 logger 或 REQUEST，改從 RequestContext 讀').not.toThrow()
    expect(() => app.get(ReceiptsProducer), 'ReceiptsProducer 也要維持 singleton').not.toThrow()
  })
})
