import { Test } from '@nestjs/testing'
import { OrdersService, OutOfStockError } from './orders.service.js'

// 把要測的 OrdersService 本身換成替身：測到的是替身，不是程式
describe('OrdersService.create', () => {
  const fake = { create: vi.fn() }
  let service: OrdersService

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ providers: [{ provide: OrdersService, useValue: fake }] }).compile()
    service = moduleRef.get(OrdersService)
  })

  it('建立訂單', async () => {
    fake.create.mockResolvedValue({ id: 1, productId: 2, quantity: 2, total: 220 })
    await expect(service.create({ productId: 2, quantity: 2 })).resolves.toEqual({ id: 1, productId: 2, quantity: 2, total: 220 })
  })

  it('庫存不足', async () => {
    fake.create.mockRejectedValue(new OutOfStockError('拿鐵', 3))
    await expect(service.create({ productId: 2, quantity: 4 })).rejects.toThrow(OutOfStockError)
  })
})
