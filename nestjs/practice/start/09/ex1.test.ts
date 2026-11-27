// 練習 1：TimingInterceptor 用 APP_INTERCEPTOR 註冊，成功和錯誤回應都有 Server-Timing
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { setTimeout as sleep } from 'node:timers/promises'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'
import { ReportsService } from './src/reports/reports.service.js'

const FORMAT = /^app;dur=\d+(\.\d+)?$/
const dur = (res: request.Response) => Number(String(res.headers['server-timing']).replace('app;dur=', ''))

let app: INestApplication
beforeAll(async () => {
  // 報表固定花 120ms：證明量的是這個請求的時間
  app = await createTestApp(AppModule, {
    override: b => b.overrideProvider(ReportsService).useValue({ daily: async () => { await sleep(120); return { orders: 1, revenue: 290 } } }),
  })
})
afterAll(() => app?.close())
const http = () => request(app.getHttpServer())

describe('練習 1：Server-Timing', () => {
  it('成功的回應帶 Server-Timing: app;dur=<毫秒>', async () => {
    const res = await http().get('/menu')
    expect(res.status, 'GET /menu 要回 200').toBe(200)
    expect(res.headers['server-timing'], '回應要有 Server-Timing 標頭，格式是 app;dur=12.3：寫 TimingInterceptor，用 { provide: APP_INTERCEPTOR, useClass: TimingInterceptor } 註冊成全域').toMatch(FORMAT)
  })

  it('錯誤回應（404、400）也要有 Server-Timing', async () => {
    for (const path of ['/products/999', '/customers/999', '/products/abc']) {
      const res = await http().get(path)
      expect(res.status, `GET ${path} 應該是錯誤回應`).toBeGreaterThanOrEqual(400)
      expect(res.headers['server-timing'], `GET ${path} 的錯誤回應也要有 Server-Timing：tap(fn) 只在成功時執行，錯誤時要另外處理（tap({ next, error })、catchError 記完再丟出，或 finalize）`).toMatch(FORMAT)
    }
    const order = await http().post('/orders').send({ customerId: 1, items: [{ productId: 6, qty: 10, size: 'M' }] })
    expect(order.status, '起司蛋糕只剩 2 個，買 10 個是 409').toBe(409)
    expect(order.headers['server-timing'], '領域錯誤（409）的回應也要有 Server-Timing').toMatch(FORMAT)
  })

  it('量的是每個請求自己的時間：慢的請求比較大，快的請求很小', async () => {
    await sleep(300)   // 應用程式已經啟動一段時間：從載入模組或啟動時開始算，數字會超過 300
    const slow = await http().get('/reports/daily')
    expect(slow.status, 'GET /reports/daily 要回 200').toBe(200)
    expect(dur(slow), '報表花了 120ms，dur 要 >= 120：開始時間要在 intercept() 裡、呼叫 next.handle() 之前記下，結束時間在回應出來時才算').toBeGreaterThanOrEqual(119)
    expect(dur(slow), 'dur 太大了：開始時間要在每次 intercept() 時記，不能寫在檔案最上層或 constructor（那是應用程式啟動的時間）').toBeLessThan(290)
    const fast = await http().get('/menu')
    expect(dur(fast), '/menu 很快，dur 應該遠小於 100ms：每個請求要有自己的開始時間').toBeLessThan(100)
  })

  it('全域註冊：AppModule 裡每個 controller 都有', async () => {
    for (const path of ['/orders/1', '/deliveries/1/eta', '/products/1']) {
      const res = await http().get(path)
      expect(res.headers['server-timing'], `GET ${path} 也要有 Server-Timing：用 APP_INTERCEPTOR 註冊成全域，不要只貼在某個 controller 上`).toMatch(FORMAT)
    }
  })
})
