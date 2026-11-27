import { Test } from '@nestjs/testing'
import { OrdersService, OutOfStockError } from './orders.service.js'
import { ProductsService } from './products.service.js'
import { OrdersRepository } from './orders.repository.js'

describe('OrdersService.create', () => {
  const products = { findOne: vi.fn() }
  const orders = { save: vi.fn() }
  let service: OrdersService

  beforeEach(async () => {
    // Arrange：每個測試前重建，替身的回傳值也在這裡設定，測試之間不共用狀態
    products.findOne.mockResolvedValue({ id: 2, name: '拿鐵', price: 110, stock: 3 })
    orders.save.mockImplementation(async order => ({ id: 1, ...order }))
    service = new OrdersService(products as unknown as ProductsService, orders as unknown as OrdersRepository)
  })

  it('總額是單價 × 數量，交給 repository 存起來', async () => {
    const order = await service.create({ productId: 2, quantity: 2 })
    expect(orders.save).toHaveBeenCalledWith({ productId: 2, quantity: 2, total: 220 })
    expect(order).toEqual({ id: 1, productId: 2, quantity: 2, total: 220 })
  })

  it('剛好買完庫存可以下單', async () => {
    await expect(service.create({ productId: 2, quantity: 3 })).resolves.toMatchObject({ total: 330 })
  })

  it('庫存不足丟 OutOfStockError，而且不會存訂單', async () => {
    await expect(service.create({ productId: 2, quantity: 4 })).rejects.toThrow(OutOfStockError)
    expect(orders.save).not.toHaveBeenCalled()
  })
})
