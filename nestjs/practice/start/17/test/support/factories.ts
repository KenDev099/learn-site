import type { Category, Customer, Order, OrderItem, Prisma, PrismaClient, Product } from '../../src/generated/prisma/client.js'

// 練習 2：測試資料工廠。每個工廠都有合理的預設值，測試只寫自己在乎的欄位
//   const latte = await createProduct(prisma, { stock: 0 })

export async function createCategory(prisma: PrismaClient, overrides: Partial<Prisma.CategoryUncheckedCreateInput> = {}): Promise<Category> {
  throw new Error('練習 2：還沒寫 createCategory')
}

// 預設：可販售、庫存 10；沒給 categoryId 就自己建一個分類
export async function createProduct(prisma: PrismaClient, overrides: Partial<Prisma.ProductUncheckedCreateInput> = {}): Promise<Product> {
  throw new Error('練習 2：還沒寫 createProduct')
}

export async function createCustomer(prisma: PrismaClient, overrides: Partial<Prisma.CustomerUncheckedCreateInput> = {}): Promise<Customer> {
  throw new Error('練習 2：還沒寫 createCustomer')
}

// 沒給 customerId 就建一位顧客；沒給 items 就建一個商品、買 1 個。單價用商品現在的價格
// 工廠直接寫入資料：不扣庫存、不跑 OrdersService 的規則
export type OrderOverrides = { customerId?: number; items?: { productId: number; quantity?: number }[] }

export async function createOrder(prisma: PrismaClient, overrides: OrderOverrides = {}): Promise<Order & { items: OrderItem[] }> {
  throw new Error('練習 2：還沒寫 createOrder')
}
