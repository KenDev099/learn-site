// 記憶體裡的咖啡店資料庫（不用改）。欄位名稱照資料庫的習慣用 snake_case，方法都是 async，跟真的資料庫一樣要 await。
// 測試每次會用 createDb() 建一個新的、內容隨機的資料庫，放進 context.db：resolver 一律從 context.db 取資料
import { CUSTOMERS, PRODUCTS, type Customer, type Product } from '../../helpers/coffee.ts'

export type ProductRow = Product
export type CustomerRow = Customer
export type OrderRow = { id: string, customer_id: string, ordered_at: string }
export type OrderItemRow = { order_id: string, product_id: string, quantity: number, unit_price: number }
export type Tables = {
  products: ProductRow[]
  customers: CustomerRow[]
  orders: OrderRow[]
  order_items: OrderItemRow[]
  stock: Record<string, number>   // 商品 id → 庫存數量
}
// 資料存取物件：resolver 透過 context.db 呼叫這些方法
export type Db = {
  tables: Tables
  customerById(id: string): Promise<CustomerRow | null>
  productById(id: string): Promise<ProductRow | null>
  orderById(id: string): Promise<OrderRow | null>
  listOrders(): Promise<OrderRow[]>
  ordersByCustomer(customerId: string): Promise<OrderRow[]>
  itemsByOrder(orderId: string): Promise<OrderItemRow[]>
  stockOf(productId: string): Promise<number>
  takeStock(productId: string, quantity: number): Promise<void>
  insertOrder(customerId: string, lines: { productId: string, quantity: number, unitPrice: number }[]): Promise<OrderRow>
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>
}

// 範例資料：3 張訂單，每個商品庫存 10
export function sampleTables(): Tables {
  return {
    products: PRODUCTS.map(p => ({ ...p })),
    customers: CUSTOMERS.map(c => ({ ...c })),
    orders: [
      { id: '1', customer_id: '1', ordered_at: '2026-10-01T08:30:00.000Z' },
      { id: '2', customer_id: '2', ordered_at: '2026-10-01T09:10:00.000Z' },
      { id: '3', customer_id: '1', ordered_at: '2026-10-02T07:45:00.000Z' },
    ],
    order_items: [
      { order_id: '1', product_id: '1', quantity: 1, unit_price: 80 },
      { order_id: '1', product_id: '5', quantity: 2, unit_price: 70 },
      { order_id: '2', product_id: '2', quantity: 2, unit_price: 110 },
      { order_id: '3', product_id: '4', quantity: 1, unit_price: 90 },
    ],
    stock: Object.fromEntries(PRODUCTS.map(p => [p.id, 10])),
  }
}

export function createDb(tables: Tables = sampleTables()): Db {
  const t = tables
  let lock: Promise<unknown> = Promise.resolve()
  const db: Db = {
    tables: t,
    async customerById(id: string) { return t.customers.find(c => c.id === id) ?? null },
    async productById(id: string) { return t.products.find(p => p.id === id) ?? null },
    async orderById(id: string) { return t.orders.find(o => o.id === id) ?? null },
    async listOrders() { return [...t.orders] },
    async ordersByCustomer(customerId: string) { return t.orders.filter(o => o.customer_id === customerId) },
    async itemsByOrder(orderId: string) { return t.order_items.filter(i => i.order_id === orderId) },
    async stockOf(productId: string) { return t.stock[productId] ?? 0 },
    // 扣庫存。跟資料庫的 CHECK (stock >= 0) 一樣：扣到負數就丟錯
    async takeStock(productId: string, quantity: number) {
      const left = (t.stock[productId] ?? 0) - quantity
      if (left < 0) throw new Error(`庫存不能小於 0（商品 ${productId}）`)
      t.stock[productId] = left
    },
    // 新增一張訂單和它的品項，回傳新的訂單；unit_price 是下單當下的價格
    async insertOrder(customerId: string, lines: { productId: string, quantity: number, unitPrice: number }[]) {
      const id = String(Math.max(0, ...t.orders.map(o => Number(o.id))) + 1)
      const order: OrderRow = { id, customer_id: customerId, ordered_at: new Date().toISOString() }
      t.orders.push(order)
      for (const l of lines) t.order_items.push({ order_id: id, product_id: l.productId, quantity: l.quantity, unit_price: l.unitPrice })
      return order
    },
    // 交易：同一時間只有一個交易在執行（後來的排隊等）；fn 丟錯時，fn 裡做過的修改全部還原
    transaction(fn) {
      const run = lock.then(async () => {
        const before = structuredClone(t)
        try {
          return await fn(db)
        } catch (e) {
          Object.assign(t, before)
          throw e
        }
      })
      lock = run.catch(() => {})
      return run
    },
  }
  return db
}
