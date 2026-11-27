import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApp } from '../src/app.setup.js'
import { PaymentGateway } from '../src/payments/payment.gateway.js'

describe('POST /api/orders', () => {
  let app: INestApplication
  // 只換外部的金流；ProductsService、OrdersService、pipe、filter 都是真的
  const payments = { charge: vi.fn() }

  // 每個測試一個新的 app：庫存在記憶體裡，上一個測試扣掉的不會影響下一個
  beforeEach(async () => {
    payments.charge.mockResolvedValue({ chargeId: 'ch_test_1' })
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .compile()
    app = moduleRef.createNestApplication({ logger: false })
    configureApp(app)   // 跟 main.ts 一樣的全域設定
    await app.init()
  })
  afterEach(() => app.close())

  const order = (productId: number, qty: number) => ({ customerId: 1, items: [{ productId, qty, size: 'M' }] })
  const post = (body: object) => request(app.getHttpServer()).post('/api/orders').send(body)

  it('成功：201，回傳總額，用總額向金流扣款', async () => {
    const res = await post(order(2, 2))

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ total: 220, status: 'paid', chargeId: 'ch_test_1' })
    expect(payments.charge).toHaveBeenCalledWith(220, expect.any(String))
  })

  it('缺 items：400 VALIDATION_FAILED，不會扣款', async () => {
    const res = await post({ customerId: 1 })

    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('VALIDATION_FAILED')
    expect(payments.charge).not.toHaveBeenCalled()
  })

  it('多送不認識的欄位：400', async () => {
    const res = await post({ ...order(2, 1), discount: 100 })

    expect(res.status).toBe(400)
  })

  it('庫存不足：409 OUT_OF_STOCK', async () => {
    const res = await post(order(6, 3))   // 起司蛋糕只剩 2 個

    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('OUT_OF_STOCK')
    expect(payments.charge).not.toHaveBeenCalled()
  })

  it('金流失敗：502 PAYMENT_FAILED，不洩漏金流的錯誤訊息', async () => {
    payments.charge.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.8:443'))

    const res = await post(order(2, 1))

    expect(res.status).toBe(502)
    expect(res.body.errorCode).toBe('PAYMENT_FAILED')
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED')
  })
})
