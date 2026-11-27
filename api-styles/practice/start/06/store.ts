// 練習 1、2 的資料（不用改）：記憶體裡的咖啡店資料。store 的每個方法都會把 calls 加 1，測試用它確認 resolver 有沒有被呼叫
import { CUSTOMERS, PRODUCTS, shuffle } from '../../helpers/coffee.ts'

export type Role = 'CUSTOMER' | 'STAFF'
// 目前登入的人：顧客的 id 就是 customers 的 id；店員的 id 是 staff-1 這種
export type Viewer = { id: string, role: Role }

export type CustomerRow = { id: string, name: string, email: string }
export type ProductRow = { id: string, name: string, price: number }
export type ItemRow = { productId: string, quantity: number }
export type OrderRow = { id: string, customerId: string, total: number, internalNote: string | null, items: ItemRow[] }

export type Store = {
  calls: number
  menu(): ProductRow[]
  product(id: string): ProductRow | null
  customer(id: string): CustomerRow | null
  order(id: string): OrderRow | null
  ordersOfCustomer(customerId: string): OrderRow[]
  ordersWithProduct(productId: string): OrderRow[]
}

// 用固定種子的亂數產生資料：每位顧客至少一張訂單，email、備註、數量每次都不同
export function createStore(random: () => number, orderCount = 24) {
  const int = (n: number) => Math.floor(random() * n)
  const products: ProductRow[] = PRODUCTS.map(({ id, name, price }) => ({ id, name, price }))
  const customers: CustomerRow[] = CUSTOMERS.map(c => ({ ...c, email: `guest${c.id}-${int(9000) + 1000}@example.tw` }))
  const notes = ['上次投訴過拿鐵太燙', '常客，記得問要不要集點', '要求少冰', '曾經付款失敗兩次']
  const orders: OrderRow[] = []
  for (let i = 0; i < Math.max(orderCount, customers.length); i++) {
    const customerId = i < customers.length ? customers[i].id : customers[int(customers.length)].id
    const items = shuffle(products, random).slice(0, 1 + int(3)).map(p => ({ productId: p.id, quantity: 1 + int(3) }))
    const total = items.reduce((sum, it) => sum + products.find(p => p.id === it.productId)!.price * it.quantity, 0)
    orders.push({ id: '', customerId, total, internalNote: random() < 0.6 ? notes[int(notes.length)] : null, items })
  }
  shuffle(orders, random).forEach((o, i) => { o.id = String(101 + i) })
  orders.sort((a, b) => Number(a.id) - Number(b.id))

  const store: Store = {
    calls: 0,
    menu() { store.calls++; return products },
    product(id) { store.calls++; return products.find(p => p.id === id) ?? null },
    customer(id) { store.calls++; return customers.find(c => c.id === id) ?? null },
    order(id) { store.calls++; return orders.find(o => o.id === id) ?? null },
    ordersOfCustomer(customerId) { store.calls++; return orders.filter(o => o.customerId === customerId) },
    ordersWithProduct(productId) { store.calls++; return orders.filter(o => o.items.some(it => it.productId === productId)) },
  }
  return { store, customers, orders, products }
}
