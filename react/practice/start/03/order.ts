// 練習 2：訂單的不可變更新（純函式，不需要 React）
// 這些函式之後會這樣用：setOrder(o => addItem(o, product))。現在每一個都直接改傳進來的 order，
// React 用 Object.is 比較新舊 state，收到同一個物件就不會重新 render。
// 要求：每個函式都回傳「新的 order」，不能改到傳進來的 order 或它裡面的任何物件、陣列
//   1. setNote(order, note)：換備註
//   2. setPhone(order, phone)：換 customer.phone
//   3. addItem(order, product)：這個商品已經在 items 裡 → 那一列數量加 1；不在 → 加到最後一列，
//      { productId: product.id, quantity: 1, unitPrice: product.price }
//   4. setQuantity(order, productId, quantity)：把那一列改成指定數量；quantity 小於等於 0 → 移除那一列
//   5. sortByPrice(order)：items 依 unitPrice 由低到高排序，單價相同的維持原本的先後
//   6. 沒有變的部分要沿用原本的參考：例如 setNote 之後 next.items === order.items，
//      addItem 之後沒被改到的那幾列還是原本的物件
// 不能做的事：用 structuredClone 或 JSON.parse(JSON.stringify(…)) 把整張訂單複製一份再改（第 6 點會沒過）
import type { Product } from '../../helpers/fake-api.ts'

export type OrderItem = { productId: number; quantity: number; unitPrice: number }
export type Order = {
  customer: { name: string; phone: string }
  note: string
  items: OrderItem[]
}

export function setNote(order: Order, note: string): Order {
  order.note = note
  return order
}

export function setPhone(order: Order, phone: string): Order {
  order.customer.phone = phone
  return order
}

export function addItem(order: Order, product: Product): Order {
  const item = order.items.find(i => i.productId === product.id)
  if (item) item.quantity += 1
  else order.items.push({ productId: product.id, quantity: 1, unitPrice: product.price })
  return order
}

export function setQuantity(order: Order, productId: number, quantity: number): Order {
  const index = order.items.findIndex(i => i.productId === productId)
  if (quantity <= 0) order.items.splice(index, 1)
  else order.items[index].quantity = quantity
  return order
}

export function sortByPrice(order: Order): Order {
  order.items.sort((a, b) => a.unitPrice - b.unitPrice)
  return order
}
