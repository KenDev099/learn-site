// 練習 2：訂單的不可變更新（純函式，不需要 React）
// 錯誤寫法：只複製第一層：next.customer、next.items 還是原本的物件與陣列，改它們就是改到舊的 state
// 原則：從改到的那個值一路往上，每一層都做一份新的；沒改到的部分沿用原本的參考
import type { Product } from '../../helpers/fake-api.ts'

export type OrderItem = { productId: number; quantity: number; unitPrice: number }
export type Order = {
  customer: { name: string; phone: string }
  note: string
  items: OrderItem[]
}

export function setNote(order: Order, note: string): Order {
  const next = { ...order }
  next.note = note
  return next
}

export function setPhone(order: Order, phone: string): Order {
  const next = { ...order }
  next.customer.phone = phone
  return next
}

export function addItem(order: Order, product: Product): Order {
  const next = { ...order }
  const item = next.items.find(i => i.productId === product.id)
  if (item) item.quantity += 1
  else next.items.push({ productId: product.id, quantity: 1, unitPrice: product.price })
  return next
}

export function setQuantity(order: Order, productId: number, quantity: number): Order {
  const next = { ...order }
  const index = next.items.findIndex(i => i.productId === productId)
  if (quantity <= 0) next.items.splice(index, 1)
  else next.items[index].quantity = quantity
  return next
}

export function sortByPrice(order: Order): Order {
  const next = { ...order }
  next.items.sort((a, b) => a.unitPrice - b.unitPrice)
  return next
}
