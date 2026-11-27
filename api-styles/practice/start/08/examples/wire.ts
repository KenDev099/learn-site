// node examples/wire.ts（在 work/08 執行）：看線上格式的每個位元組，以及「預設值不會被送出」
import { create, isFieldSet, toBinary } from '@bufbuild/protobuf'
import { OrderItemSchema, OrderSchema } from '../gen/coffee/demo/v1/order_pb.js'

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex').match(/../g)?.join(' ') ?? '（0 個位元組）'

console.log('拿鐵 3 杯：     ', hex(toBinary(OrderItemSchema, create(OrderItemSchema, { productId: '2', quantity: 3, unitPriceTwd: 110 }))))
console.log('單價 300：      ', hex(toBinary(OrderItemSchema, create(OrderItemSchema, { productId: '2', quantity: 3, unitPriceTwd: 300 }))))
console.log('數量 0：        ', hex(toBinary(OrderItemSchema, create(OrderItemSchema, { productId: '2', quantity: 0, unitPriceTwd: 110 }))))
console.log('什麼都沒給：    ', hex(toBinary(OrderItemSchema, create(OrderItemSchema))))

const noDiscount = create(OrderSchema, { id: '7' })
const zeroDiscount = create(OrderSchema, { id: '7', discountTwd: 0 })
console.log('沒有折扣：      ', hex(toBinary(OrderSchema, noDiscount)), ' discountTwd =', noDiscount.discountTwd, ' isFieldSet =', isFieldSet(noDiscount, OrderSchema.field.discountTwd))
console.log('折扣 0 元：     ', hex(toBinary(OrderSchema, zeroDiscount)), ' discountTwd =', zeroDiscount.discountTwd, ' isFieldSet =', isFieldSet(zeroDiscount, OrderSchema.field.discountTwd))
