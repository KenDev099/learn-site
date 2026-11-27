import { orders } from './orders.ts'
import { lineTotal } from './price.ts'

let total = 0
for (const o of orders) {
  const subtotal = lineTotal(o.price, o.qty)
  total += subtotal
  console.log(`${o.name} ×${o.qty} = ${subtotal}`)
}
console.log(`合計 ${total}`)
