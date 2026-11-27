import { orders } from './orders.ts'

let total = 0
for (const o of orders) {
  total += o.price * o.qty
  console.log(`${o.name} ×${o.qty} = ${o.price * o.qty}`)
}
console.log(`合計 ${total}`)
