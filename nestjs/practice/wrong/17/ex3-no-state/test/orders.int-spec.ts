import { Test, type TestingModule } from '@nestjs/testing'
import { AppModule } from '../src/app.module.js'
import { OutOfStockError } from '../src/errors/domain-errors.js'
import { OrdersService } from '../src/orders/orders.service.js'
import { PrismaService } from '../src/prisma/prisma.service.js'
import { createCustomer, createProduct } from './support/factories.js'
import { resetDb } from './support/reset-db.js'

// OrdersService 的整合測試，連真的 PostgreSQL（npm test 用的是 nest_17_spec）
describe('OrdersService.createOrder（真的資料庫）', () => {
  let moduleRef: TestingModule
  let orders: OrdersService
  let prisma: PrismaService

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    orders = moduleRef.get(OrdersService)
    prisma = moduleRef.get(PrismaService)
  })
  afterAll(() => moduleRef.close())   // 關掉應用，PrismaService 才會釋放連線池
  beforeEach(() => resetDb(prisma))   // 每個測試都從空的資料表開始

  const stockOf = async (id: number) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stock

  it('成功下單：扣庫存，訂單總額與明細正確', async () => {
    const customer = await createCustomer(prisma)
    const latte = await createProduct(prisma, { price: 110, stock: 5 })

    const order = await orders.createOrder(customer.id, [{ productId: latte.id, quantity: 2 }])

    expect(order.total).toBe(220)
    expect(order.items).toEqual([{ productId: latte.id, quantity: 2, unitPrice: 110 }])
  })

  it('庫存不足：丟 OutOfStockError，不建立訂單', async () => {
    const customer = await createCustomer(prisma)
    const cake = await createProduct(prisma, { stock: 1 })

    await expect(orders.createOrder(customer.id, [{ productId: cake.id, quantity: 2 }])).rejects.toBeInstanceOf(OutOfStockError)

  })

  it('第二項庫存不足：整筆回滾，第一項的庫存也沒被扣', async () => {
    const customer = await createCustomer(prisma)
    const latte = await createProduct(prisma, { stock: 5 })
    const cake = await createProduct(prisma, { stock: 1 })

    await expect(orders.createOrder(customer.id, [
      { productId: latte.id, quantity: 1 },
      { productId: cake.id, quantity: 3 },
    ])).rejects.toBeInstanceOf(OutOfStockError)

  })

  it('單價快照：下單後商品改價，訂單的單價與總額不變', async () => {
    const customer = await createCustomer(prisma)
    const latte = await createProduct(prisma, { price: 110 })
    const { id } = await orders.createOrder(customer.id, [{ productId: latte.id, quantity: 2 }])

    await prisma.product.update({ where: { id: latte.id }, data: { price: 130 } })

    const order = await orders.findOrder(id)
    expect(order.items[0].unitPrice).toBe(110)
    expect(order.total).toBe(220)
  })

  it('庫存 5、同時 10 張訂單：剛好 5 張成功，庫存變 0，不會賣超', async () => {
    const customer = await createCustomer(prisma)
    const latte = await createProduct(prisma, { stock: 5 })

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => orders.createOrder(customer.id, [{ productId: latte.id, quantity: 1 }])),
    )

    const failed = results.filter(r => r.status === 'rejected')
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(5)
    expect(failed.every(r => r.reason instanceof OutOfStockError)).toBe(true)
  })
})
