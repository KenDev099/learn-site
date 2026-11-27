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
      .overrideProvider(PaymentGateway).useValue(payments)
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
})
