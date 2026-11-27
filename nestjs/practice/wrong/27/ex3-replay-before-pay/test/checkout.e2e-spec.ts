import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createApp, drain, receipts, resetAll, sendPaymentWebhook } from './support/app.js'

// 保護「下單 → 付款 webhook → 集點、收據」這條主流程。只透過 HTTP 操作與檢查
describe('結帳主流程', () => {
  let app: INestApplication
  const http = () => request(app.getHttpServer())
  const order = (key: string | undefined, body: object) => {
    const req = http().post('/api/v1/orders')
    return key ? req.set('Idempotency-Key', key).send(body) : req.send(body)
  }
  const twoLattes = { customerId: 1, items: [{ productId: 2, quantity: 2 }] }

  beforeAll(async () => { app = await createApp() })
  afterAll(() => app.close())
  beforeEach(() => resetAll(app))

  it('下單成功：201，扣庫存，金額是單價 × 數量', async () => {
    const res = await order('k-1', { customerId: 1, items: [{ productId: 2, quantity: 2 }, { productId: 1, quantity: 1 }] })
    expect(res.status).toBe(201)
    expect(res.body.total).toBe(300)
    expect(res.body.status).toBe('pending')
    // 菜單不帶庫存：用另一張訂單買光來確認庫存真的少了
    const rest = await order('k-2', { customerId: 2, items: [{ productId: 2, quantity: 9 }] })
    expect(rest.status, '拿鐵原本 10 杯，賣了 2 杯只剩 8 杯').toBe(409)
    expect(rest.body.errorCode).toBe('OUT_OF_STOCK')
  })

  it('沒有 Idempotency-Key：400，不建立訂單', async () => {
    const res = await order(undefined, twoLattes)
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('IDEMPOTENCY_KEY_REQUIRED')
    expect((await http().get('/api/v1/orders/1')).status).toBe(404)
  })

  it('同一個 Idempotency-Key 重送：一樣的狀態碼與內容，只有一張訂單，庫存只扣一次', async () => {
    const first = await order('k-1', twoLattes)
    const again = await order('k-1', twoLattes)
    expect(again.status).toBe(201)
    expect(again.text).toBe(first.text)
    expect((await http().get('/api/v1/orders/2')).status, '重送不能建立第二張訂單').toBe(404)
    expect((await order('k-2', { customerId: 1, items: [{ productId: 2, quantity: 8 }] })).status, '庫存只扣一次：還剩 8 杯').toBe(201)


    const other = await order('k-1', { customerId: 1, items: [{ productId: 1, quantity: 1 }] })
    expect(other.status).toBe(422)
    expect(other.body.errorCode).toBe('IDEMPOTENCY_KEY_REUSED')
  })

  it('付款 webhook 之後：訂單 paid、集點、一封收據；webhook 重送不會多加點、多寄信', async () => {
    const created = await order('k-1', twoLattes)
    expect((await sendPaymentWebhook(app, { id: 'evt_1', orderId: created.body.id })).status).toBe(200)
    expect((await sendPaymentWebhook(app, { id: 'evt_1', orderId: created.body.id })).status).toBe(200)
    await drain(app)
    expect((await http().get(`/api/v1/orders/${created.body.id}`)).body.status).toBe('paid')
    expect((await http().get('/api/v1/customers/1/points')).body).toEqual({ customerId: 1, points: 2 })
    expect(receipts(app)).toHaveLength(1)
  })
})
