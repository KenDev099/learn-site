// node examples/encode.ts（在 work/08 執行）：建立訊息 → 編成位元組 → 解回來 → 轉成 JSON
import { create, fromBinary, toBinary, toJson, toJsonString } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { OrderSchema, OrderStatus } from '../gen/coffee/demo/v1/order_pb.js'

const order = create(OrderSchema, {
  id: '42',
  status: OrderStatus.PENDING,
  items: [
    { productId: '2', quantity: 2, unitPriceTwd: 110 },
    { productId: '5', quantity: 1, unitPriceTwd: 70 },
  ],
  totalTwd: 290,
  notes: { cup: 'own' },
  orderedAt: timestampFromDate(new Date('2026-10-01T08:30:00Z')),
  pickup: { case: 'tableNo', value: 5 },
  loyaltyPoints: 1200n,
})

const bytes = toBinary(OrderSchema, order)
const json = toJsonString(OrderSchema, order)
console.log('protobuf：', bytes.length, '位元組')
console.log('JSON：    ', Buffer.byteLength(json), '位元組')

const back = fromBinary(OrderSchema, bytes)
console.log('解回來的 status：', back.status, '=', OrderStatus[back.status])
console.log('解回來的 pickup：', back.pickup)
console.log('loyaltyPoints 的型別：', typeof back.loyaltyPoints)
console.log('toJson：', toJson(OrderSchema, back))

try {
  JSON.stringify(back)
} catch (e) {
  console.log('直接 JSON.stringify 訊息：', (e as Error).message)
}
