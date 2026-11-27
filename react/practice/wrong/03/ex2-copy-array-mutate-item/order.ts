// 練習 2：訂單的不可變更新（純函式，不需要 React）
// 錯誤寫法：陣列複製了，但裡面的物件還是原本的：item.quantity += 1 改到舊的 state
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
  const items = [...order.items]
  const item = items.find(i => i.productId === product.id)
  if (item) item.quantity += 1
  else items.push({ productId: product.id, quantity: 1, unitPrice: product.price })
  return { ...order, items }
}

export function setQuantity(order: Order, productId: number, quantity: number): Order {
  const items = [...order.items]
  const index = items.findIndex(i => i.productId === productId)
  if (quantity <= 0) items.splice(index, 1)
  else items[index].quantity = quantity
  return { ...order, items }
}

export function sortByPrice(order: Order): Order {
  // toSorted（ES2023）回傳排好的新陣列，不動原本的；sort 會直接改原陣列
  return { ...order, items: order.items.toSorted((a, b) => a.unitPrice - b.unitPrice) }
}
