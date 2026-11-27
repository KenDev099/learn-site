import type { Category, Customer, Order, OrderItem, Prisma, PrismaClient, Product } from '../../src/generated/prisma/client.js'

// 測試資料工廠。每個工廠都有合理的預設值，測試只寫自己在乎的欄位
//   const latte = await createProduct(prisma, { stock: 0 })

// 每次呼叫都不同的編號：唯一欄位（名稱、電話）才不會撞到。不依賴資料庫的自動編號
let seq = 0
const next = () => ++seq

export async function createCategory(prisma: PrismaClient, overrides: Partial<Prisma.CategoryUncheckedCreateInput> = {}): Promise<Category> {
  return prisma.category.create({ data: { name: `分類 ${next()}`, ...overrides } })
}

// 預設：可販售、庫存 10；沒給 categoryId 就自己建一個分類
export async function createProduct(prisma: PrismaClient, overrides: Partial<Prisma.ProductUncheckedCreateInput> = {}): Promise<Product> {
  const categoryId = overrides.categoryId ?? (await createCategory(prisma)).id
  return prisma.product.create({
    data: { name: `商品 ${next()}`, price: 100, stock: 10, isAvailable: true, ...overrides, categoryId },
  })
}

export async function createCustomer(prisma: PrismaClient, overrides: Partial<Prisma.CustomerUncheckedCreateInput> = {}): Promise<Customer> {
  const n = next()
  return prisma.customer.create({ data: { name: `顧客 ${n}`, phone: `0900${String(n).padStart(6, '0')}`, ...overrides } })
}

// 沒給 customerId 就建一位顧客；沒給 items 就建一個商品、買 1 個。單價用商品現在的價格
// 工廠直接寫入資料：不扣庫存、不跑 OrdersService 的規則
export type OrderOverrides = { customerId?: number; items?: { productId: number; quantity?: number }[] }

export async function createOrder(prisma: PrismaClient, overrides: OrderOverrides = {}): Promise<Order & { items: OrderItem[] }> {
  const customerId = overrides.customerId ?? (await createCustomer(prisma)).id
  const items = overrides.items ?? [{ productId: (await createProduct(prisma)).id }]
  const lines = []
  for (const { productId, quantity = 1 } of items) {
    const { price } = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { price: true } })
    lines.push({ productId, quantity, unitPrice: price })
    // 錯誤：工廠跑了下單規則，把庫存也扣掉
    await prisma.product.update({ where: { id: productId }, data: { stock: { decrement: quantity } } })
  }
  return prisma.order.create({
    data: {
      customerId,
      total: lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
      items: { create: lines },
    },
    include: { items: { orderBy: { id: 'asc' } } },
  })
}
