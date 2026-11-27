// 練習 2：訂單的不可變更新（純函式，不需要 React）
// 錯誤寫法：數量 0 沒有移除那一列
// 原則：從改到的那個值一路往上，每一層都做一份新的；沒改到的部分沿用原本的參考
import type { Product } from '../../helpers/fake-api.ts'

export type OrderItem = { productId: number; quantity: number; unitPrice: number }
export type Order = {
  customer: { name: string; phone: string }
  note: string
  items: OrderItem[]
}

export function setNote(order: Order, note: string): Order {
  return { ...order, note }
}

export function setPhone(order: Order, phone: string): Order {
  return { ...order, customer: { ...order.customer, phone } }
}

export function addItem(order: Order, product: Product): Order {
  const exists = order.items.some(i => i.productId === product.id)
  const items = exists
    ? order.items.map(i => (i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i))
    : [...order.items, { productId: product.id, quantity: 1, unitPrice: product.price }]
  return { ...order, items }
}

export function setQuantity(order: Order, productId: number, quantity: number): Order {
  return { ...order, items: order.items.map(i => (i.productId === productId ? { ...i, quantity } : i)) }
}

export function sortByPrice(order: Order): Order {
  // toSorted（ES2023）回傳排好的新陣列，不動原本的；sort 會直接改原陣列
  return { ...order, items: order.items.toSorted((a, b) => a.unitPrice - b.unitPrice) }
}
