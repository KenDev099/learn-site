// 錯誤寫法：連自己的 OrdersService 也換成替身，測到的是自己設定的回傳值
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { configureApp } from '../src/app.setup.js'
import { OutOfStockError, PaymentFailedError } from '../src/errors/domain-errors.js'
import { OrdersService } from '../src/orders/orders.service.js'
import { PaymentGateway } from '../src/payments/payment.gateway.js'

describe('POST /api/orders', () => {
  let app: INestApplication
  const orders = { create: vi.fn() }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PaymentGateway).useValue({ charge: vi.fn() })
      .overrideProvider(OrdersService).useValue(orders)
      .compile()
    app = moduleRef.createNestApplication({ logger: false })
    configureApp(app)
    await app.init()
  })
  afterEach(() => app.close())

  const order = (productId: number, qty: number) => ({ customerId: 1, items: [{ productId, qty, size: 'M' }] })
  const post = (body: object) => request(app.getHttpServer()).post('/api/orders').send(body)

  it('成功：201', async () => {
    orders.create.mockResolvedValue({ id: 1, customerId: 1, total: 220, status: 'paid', chargeId: 'ch_test_1' })
    const res = await post(order(2, 2))
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ total: 220 })
  })

  it('缺 items：400 VALIDATION_FAILED', async () => {
    const res = await post({ customerId: 1 })
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('VALIDATION_FAILED')
  })

  it('庫存不足：409 OUT_OF_STOCK', async () => {
    orders.create.mockRejectedValue(new OutOfStockError(6, 3, 2))
    const res = await post(order(6, 3))
    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('OUT_OF_STOCK')
  })

  it('金流失敗：502 PAYMENT_FAILED', async () => {
    orders.create.mockRejectedValue(new PaymentFailedError(new Error('down')))
    const res = await post(order(2, 1))
    expect(res.status).toBe(502)
    expect(res.body.errorCode).toBe('PAYMENT_FAILED')
  })
})
