import { orders } from './orders.ts'

function lineTotal(price: number, qty: number): number {
  if (!Number.isInteger(qty) || qty <= 0) throw new RangeError('數量要是正整數')
  return price * qty
}

let total = 0
for (const o of orders) {
  const subtotal = lineTotal(o.price, o.qty)
  total += subtotal
  console.log(`${o.name} ×${o.qty} = ${subtotal}`)
}
console.log(`合計 ${total}`)
