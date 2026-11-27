import { Test } from '@nestjs/testing'
import { OutOfStockError } from '../src/errors/domain-errors.js'
import { OrdersService } from '../src/orders/orders.service.js'
import { PrismaService } from '../src/prisma/prisma.service.js'

// 把 Prisma 換成 mock：測到的是自己設定的回傳值，交易、並發都沒測到
describe('OrdersService（mock Prisma）', () => {
  let orders: OrdersService
  const prisma = {
    $transaction: vi.fn(),
    product: { findUnique: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    order: { create: vi.fn() },
  }

  beforeEach(async () => {
    prisma.$transaction.mockImplementation(fn => fn(prisma))
    const moduleRef = await Test.createTestingModule({ providers: [OrdersService, { provide: PrismaService, useValue: prisma }] }).compile()
    orders = moduleRef.get(OrdersService)
  })

  it('成功下單', async () => {
    prisma.product.findUnique.mockResolvedValue({ price: 110 })
    prisma.product.updateMany.mockResolvedValue({ count: 1 })
    prisma.order.create.mockImplementation(({ data }) => ({ id: 1, total: data.total }))
    const order = await orders.createOrder(1, [{ productId: 1, quantity: 2 }])
    expect(order.total).toBe(220)
  })

  it('庫存不足', async () => {
    prisma.product.findUnique.mockResolvedValue({ price: 110 })
    prisma.product.updateMany.mockResolvedValue({ count: 0 })
    prisma.product.findUniqueOrThrow.mockResolvedValue({ stock: 1 })
    await expect(orders.createOrder(1, [{ productId: 1, quantity: 2 }])).rejects.toBeInstanceOf(OutOfStockError)
  })
})
