// 練習 3：@nestjs/throttler。用假的 Date.now() 控制時間，不用真的等 10 秒
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './src/app.module.js'

let app: INestApplication | undefined
afterEach(async () => { vi.restoreAllMocks(); await app?.close(); app = undefined })
async function open() {
  app = await createTestApp(AppModule)
  return () => request(app!.getHttpServer())
}
const order = { items: [{ productId: 2, quantity: 1 }] }

describe('練習 3：限流', () => {
  it('POST /orders：10 秒內第 4 次回 429，10 秒後恢復', async () => {
    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const http = await open()
    const first = []
    for (let i = 0; i < 4; i++) first.push((await http().post('/orders').send(order)).status)
    expect(first, '同一個客戶端連續 4 次 POST /orders，要回 [201, 201, 201, 429]：ThrottlerModule.forRoot 加上 APP_GUARD 註冊 ThrottlerGuard，POST /orders 用 @Throttle({ default: { limit: 3, ttl: … } })').toEqual([201, 201, 201, 429])
    now += 5_000
    expect((await http().post('/orders').send(order)).status, '過了 5 秒還在同一個 10 秒視窗裡，要繼續回 429。回 201 的話：ttl 的單位是毫秒，10 秒是 10_000（或 seconds(10)），不是 10').toBe(429)
    now += 6_000
    expect((await http().post('/orders').send(order)).status, '過了 11 秒，視窗結束，要能再下單（201）：ttl 要是 10 秒，不要設成更長').toBe(201)
  })

  it('GET /menu 不限流（看板每 2 秒來一次）', async () => {
    const http = await open()
    const statuses = []
    for (let i = 0; i < 30; i++) statuses.push((await http().get('/menu')).status)
    expect(statuses.filter(s => s !== 200), '連續 30 次 GET /menu 都要回 200：在 MenuController 加 @SkipThrottle()').toEqual([])
  })

  it('其他路由用全域預設：每個客戶端每條路由 60 秒 20 次', async () => {
    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const http = await open()
    const statuses = []
    for (let i = 0; i < 21; i++) statuses.push((await http().get('/products')).status)
    expect(statuses.slice(0, 20).filter(s => s !== 200), '前 20 次 GET /products 都要 200：全域預設是 60 秒 20 次').toEqual([])
    expect(statuses[20], '第 21 次 GET /products 要回 429：ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 20 }] })，ThrottlerGuard 用 APP_GUARD 註冊成全域').toBe(429)
    now += 30_000
    expect((await http().get('/products')).status, '30 秒後還在 60 秒的視窗裡，要繼續 429（ttl 是毫秒：60 秒是 60_000）').toBe(429)
    now += 31_000
    expect((await http().get('/products')).status, '61 秒後視窗結束，要恢復 200').toBe(200)
  })

  it('限流排在 AdminKeyGuard 前面：猜錯金鑰的請求也會被計數', async () => {
    const original = process.env.ADMIN_KEY
    process.env.ADMIN_KEY = 'k1-' + 'a'.repeat(29)
    try {
      const http = await open()
      const statuses = []
      for (let i = 0; i < 21; i++) statuses.push((await http().delete('/products/1').set('X-Admin-Key', 'guess-' + String(i).padStart(26, '0'))).status)
      expect(statuses.slice(0, 20).filter(s => s !== 403), '前 20 次猜錯金鑰要回 403').toEqual([])
      expect(statuses[20], '第 21 次猜金鑰要回 429，不是 403：全域 guard 照 APP_GUARD 的登記順序執行，ThrottlerGuard 要登記在 AdminKeyGuard 前面，猜錯的請求才會被限流計數；不然攻擊者可以無限次猜').toBe(429)
    } finally {
      if (original === undefined) delete process.env.ADMIN_KEY
      else process.env.ADMIN_KEY = original
    }
  })
})
