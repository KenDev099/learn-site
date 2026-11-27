import { orders } from './orders.ts'
import { lineTotal } from './price.ts'

for (const o of orders) console.log(`${o.name} ×${o.qty} = ${lineTotal(o.price, o.qty)}`)
console.log(`合計 ${orders.reduce((s, o) => s + o.price * o.qty, 0)}`)
