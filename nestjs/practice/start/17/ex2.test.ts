// 練習 2：test/support/factories.ts 的測試資料工廠
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../../helpers/db.ts'
import { PrismaClient } from './src/generated/prisma/client.js'
import { createCategory, createCustomer, createOrder, createProduct } from './test/support/factories.js'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
afterAll(() => prisma.$disconnect())

beforeEach(async () => {
  await resetDb(prisma)
  // 讓自動編號不從 1 開始：工廠寫死 categoryId: 1 之類的 id 就會失敗
  for (const table of ['categories', 'products', 'customers', 'orders', 'order_items']) {
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), 41)`)
  }
})

const count = () => Promise.all([prisma.category.count(), prisma.product.count(), prisma.customer.count(), prisma.order.count()])

describe('練習 2：測試資料工廠', () => {
  it('createCategory：寫進資料庫，呼叫兩次不會撞名', async () => {
    const a = await createCategory(prisma)
    const b = await createCategory(prisma)
    expect(a.id, '要回傳寫進資料庫的分類（有 id）').toBeTypeOf('number')
    expect(a.name, '兩次的名稱要不同：categories.name 是 UNIQUE，第二次會 P2002').not.toBe(b.name)
    expect(await prisma.category.count()).toBe(2)
    expect((await createCategory(prisma, { name: '甜點' })).name, '有傳 name 就用傳入的值').toBe('甜點')
  })

  it('createProduct 的預設值：可販售、庫存 10、價格大於 0，自動建立分類', async () => {
    const p = await createProduct(prisma)
    const saved = await prisma.product.findUnique({ where: { id: p.id }, include: { category: true } })
    expect(saved, 'createProduct 要回傳寫進資料庫的商品').not.toBeNull()
    expect(saved!.stock, '預設庫存 10').toBe(10)
    expect(saved!.isAvailable, '預設可販售').toBe(true)
    expect(saved!.price, '預設價格要是正整數').toBeGreaterThan(0)
    expect(saved!.category, '沒給 categoryId 時要自己建一個分類（不要寫死 categoryId: 1）').toBeTruthy()
    const again = await createProduct(prisma)
    expect(again.name, '兩次的名稱要不同：products.name 是 UNIQUE').not.toBe(p.name)
  })

  it('createProduct 的覆寫：0 和 false 也要照用，給了 categoryId 就不另外建分類', async () => {
    const category = await createCategory(prisma)
    const p = await createProduct(prisma, { name: '拿鐵', price: 110, stock: 0, isAvailable: false, categoryId: category.id })
    expect(p, '傳入的欄位要蓋過預設值：stock: 0 不能變回 10（用 ?? 或展開，不要用 ||）').toMatchObject({ name: '拿鐵', price: 110, stock: 0, isAvailable: false, categoryId: category.id })
    expect(await prisma.category.count(), '給了 categoryId 就不要再建分類').toBe(1)
  })

  it('createCustomer：寫進資料庫，呼叫兩次不會撞電話', async () => {
    const a = await createCustomer(prisma)
    const b = await createCustomer(prisma, { name: '陳美華' })
    expect(a.id).toBeTypeOf('number')
    expect(a.phone, 'customers.phone 是 UNIQUE：每次要產生不同的電話').not.toBe(b.phone)
    expect(b.name).toBe('陳美華')
  })

  it('createOrder 什麼都不給：自己建顧客與一個商品，買 1 個，單價是商品的價格', async () => {
    const order = await createOrder(prisma)
    expect(await count(), '要建 1 位顧客、1 個商品（含分類）、1 張訂單').toEqual([1, 1, 1, 1])
    const product = await prisma.product.findFirstOrThrow()
    expect(order.items, '回傳的訂單要帶 items').toHaveLength(1)
    expect(order.items[0]).toMatchObject({ productId: product.id, quantity: 1, unitPrice: product.price })
    expect(order.total).toBe(product.price)
    expect(await prisma.order.count({ where: { id: order.id, customerId: order.customerId } }), '訂單要寫進資料庫').toBe(1)
  })

  it('createOrder 用指定的顧客與商品：不另外建資料、不扣庫存、總額正確', async () => {
    const customer = await createCustomer(prisma)
    const latte = await createProduct(prisma, { price: 110, stock: 3 })
    const cake = await createProduct(prisma, { price: 120 })
    const before = await count()

    const order = await createOrder(prisma, { customerId: customer.id, items: [{ productId: latte.id, quantity: 2 }, { productId: cake.id }] })

    const after = await count()
    expect(after.slice(0, 3), '給了 customerId 和 productId，就不要再建顧客、商品、分類').toEqual(before.slice(0, 3))
    expect(order.customerId).toBe(customer.id)
    expect(order.items.map(i => [i.productId, i.quantity, i.unitPrice]), '沒給 quantity 時是 1；單價從商品複製').toEqual([[latte.id, 2, 110], [cake.id, 1, 120]])
    expect(order.total).toBe(340)
    expect((await prisma.product.findUniqueOrThrow({ where: { id: latte.id } })).stock, '工廠只準備資料，不跑下單規則：庫存不變').toBe(3)
  })

  it('同一個測試裡建很多筆也不會撞名', async () => {
    for (let i = 0; i < 5; i++) await createOrder(prisma)
    expect(await prisma.order.count()).toBe(5)
  })
})
