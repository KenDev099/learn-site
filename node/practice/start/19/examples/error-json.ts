// node examples/error-json.ts：Error 直接 JSON.stringify 會變成 {}
import { inspect } from 'node:util'

const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })
const err = new Error('建立訂單失敗', { cause })

console.log(JSON.stringify({ msg: '出錯了', err }))
console.log(Object.keys(err), Object.getOwnPropertyNames(err))
console.log(inspect(err, { depth: 1 }).split('\n').slice(0, 2).join('\n'), '…')

const order: Record<string, unknown> = { id: 7 }
order.self = order
try {
  JSON.stringify(order)
} catch (e) {
  console.log((e as Error).message.split('\n')[0])
}
try {
  JSON.stringify({ total: 120n })
} catch (e) {
  console.log((e as Error).message)
}
