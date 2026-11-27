import { Order } from './order.js'
import { OrderStatus } from './status.js'

const order = new Order('王小明', [
  { name: '拿鐵', price: 110, qty: 2 },
  { name: '可頌', price: 70, qty: 1 },
])
console.log(order.summary())
order.advance()
order.advance()
console.log(order.summary())
console.log(order.status === OrderStatus.Ready ? '請到櫃台取餐' : '還在準備')
