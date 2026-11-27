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

  it('下單、付款、集點', async () => {
    const created = await order('k-1', twoLattes)
    expect(created.status).toBe(201)
    expect(created.body.total).toBe(220)
    expect((await sendPaymentWebhook(app, { id: 'evt_1', orderId: created.body.id })).status).toBe(200)
    await drain(app)
    expect((await http().get('/api/v1/customers/1/points')).body.points).toBe(2)
    expect(receipts(app)).toHaveLength(1)
  })
})
