// 測試共用：用固定種子產生隨機的咖啡店資料（每次執行不同，寫死答案不會過）。不用改
import { CUSTOMERS, PRODUCTS, mulberry32, shuffle } from '../../helpers/coffee.ts'
import type { Tables } from './db.ts'

export function randomTables(seed = Date.now()) {
  const random = mulberry32(seed)
  const int = (n: number) => Math.floor(random() * n)
  const customers = CUSTOMERS.map(c => ({ ...c, name: `${c.name}${int(90) + 10}` }))
  const products = PRODUCTS.map(p => ({ ...p, price: p.price + int(20) }))
  const orders: Tables['orders'] = []
  const order_items: Tables['order_items'] = []
  const count = 5 + int(4)
  for (let n = 0; n < count; n++) {
    const id = String(100 + n * 7 + int(5))
    orders.push({ id, customer_id: customers[int(customers.length)].id, ordered_at: new Date(Date.UTC(2026, 9, 1 + n, int(12), int(60))).toISOString() })
    for (const p of shuffle(products, random).slice(0, 1 + int(3))) {
      order_items.push({ order_id: id, product_id: p.id, quantity: 1 + int(3), unit_price: p.price })
    }
  }
  const tables: Tables = { products, customers, orders: shuffle(orders, random), order_items, stock: Object.fromEntries(products.map(p => [p.id, 5 + int(10)])) }
  return { tables, random, int }
}
