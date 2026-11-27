import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { ORDERS } from '../../helpers/coffee.ts'
import { toolUse } from '../../helpers/replies.ts'
import { runTool } from './tools.ts'
import { FakeDb, PendingActions, makeOrderTools } from './ex3.ts'
import type { OrderStatus, StoreOrder } from './ex3.ts'

// 王小明（顧客 1）有 1、3、7 號訂單；2 號是陳美華（顧客 2）的
const STATUS: Record<number, OrderStatus> = { 1: 'done', 2: 'received', 3: 'preparing', 4: 'ready', 5: 'done', 6: 'received', 7: 'received', 8: 'preparing' }
const ORDERS_WITH_STATUS: StoreOrder[] = ORDERS.map(o => ({ ...o, status: STATUS[o.id] }))

function setup() {
  const db = new FakeDb(ORDERS_WITH_STATUS)
  const pending = new PendingActions()
  const tools = makeOrderTools(1, db, pending)
  let n = 0
  const call = (name: string, input: unknown) => runTool(toolUse(`tu_${++n}`, name, input), tools.handlers)
  const unchanged = () => {
    for (const o of ORDERS_WITH_STATUS) assert.equal(db.findOrder(o.id)?.status, o.status, `${o.id} 號訂單的狀態被改了：工具只能寫入待確認的申請，不能直接改訂單`)
  }
  return { db, pending, tools, call, unchanged }
}

test('工具定義：get_my_orders 與 request_cancel，strict，schema 裡沒有顧客 id', () => {
  const { tools } = setup()
  assert.deepEqual(tools.definitions.map(t => t.name), ['get_my_orders', 'request_cancel'], '要有 get_my_orders 與 request_cancel 兩個工具（照這個順序）')
  for (const t of tools.definitions) {
    assert.equal(t.strict, true, `${t.name} 要 strict: true`)
    assert.equal(t.input_schema.type, 'object')
    assert.equal((t.input_schema as any).additionalProperties, false, `${t.name} 的 input_schema 要 additionalProperties: false（strict 需要）`)
    assert.ok((t.description ?? '').length >= 20, `${t.name} 的 description 要寫清楚做什麼、什麼時候用`)
  }
  assert.deepEqual(tools.definitions[1].input_schema.required, ['order_id'], 'request_cancel 只需要 order_id')
  assert.equal((tools.definitions[1].input_schema.properties as any)?.order_id?.type, 'integer', 'request_cancel 的 order_id 要是 type: "integer"：strict 會讓模型照 schema 產生，型別要跟 zod 驗證一致')
  assert.doesNotMatch(JSON.stringify(tools.definitions.map(t => t.input_schema)), /customer/i, 'input_schema 不能有顧客 id：是誰在操作，由登入狀態決定，不讓模型填')
})

test('get_my_orders 只回傳登入顧客自己的訂單，不理會模型多給的 customer_id', async () => {
  const { call } = setup()
  for (const input of [{}, { customer_id: 2 }]) {
    const r = await call('get_my_orders', input)
    assert.notEqual(r.is_error, true, `get_my_orders 不該失敗：${r.content}`)
    const orders = JSON.parse(String(r.content))
    assert.deepEqual(orders.map((o: any) => o.id), [1, 3, 7], `顧客 1 只能看到 1、3、7 號訂單（input 是 ${JSON.stringify(input)} 時也一樣）`)
    assert.deepEqual(Object.keys(orders[0]).sort(), ['id', 'orderedAt', 'status', 'total'], '每筆訂單回傳 { id, orderedAt, total, status }')
  }
})

test('request_cancel：只寫入一筆待確認的申請（含冪等鍵），訂單本身不變', async () => {
  const { pending, call, unchanged } = setup()
  const r = await call('request_cancel', { order_id: 7 })
  assert.notEqual(r.is_error, true, `7 號訂單是顧客 1 的、還沒開始做，申請要成功：${r.content}`)
  assert.match(String(r.content), /確認/, '回傳的文字要讓模型能轉告顧客：已送出申請、要等店員確認')
  assert.deepEqual(pending.list(), [{ key: 'cancel:7', type: 'cancel', orderId: 7, customerId: 1 }], 'pending 裡要有一筆 { key: "cancel:7", type: "cancel", orderId, customerId }')
  unchanged()
})

test('同一張訂單申請兩次：pending 只有一筆，第二次不是錯誤', async () => {
  const { pending, call, unchanged } = setup()
  await call('request_cancel', { order_id: 7 })
  const again = await call('request_cancel', { order_id: 7 })
  assert.notEqual(again.is_error, true, '重複申請不是錯誤：回覆「已經申請過」即可')
  assert.equal(pending.list().length, 1, '用冪等鍵 cancel:<order_id> 檢查：模型重送或顧客重複要求時，不能產生第二筆申請')
  unchanged()
})

test('別人的訂單、不存在的訂單：is_error，訊息一樣，不新增申請', async () => {
  const { pending, call, unchanged } = setup()
  for (const input of [{ order_id: 2 }, { order_id: 2, customer_id: 2 }, { order_id: 8 }, { order_id: 999 }]) {
    const r = await call('request_cancel', input)
    assert.equal(r.is_error, true, `${JSON.stringify(input)}：2、8 號是別人的訂單（8 號正在製作）、999 號不存在，都要失敗（先檢查訂單的 customerId 是不是登入的顧客，再看狀態，否則「已經在製作」會透露別人的訂單存在）`)
    assert.match(String(r.content), /找不到這張訂單/, '別人的訂單和不存在的訂單都回「找不到這張訂單」，不要讓人試出別人的訂單編號')
  }
  assert.deepEqual(pending.list(), [], '失敗時不能新增申請')
  unchanged()
})

test('已經在製作的訂單、不合法的 input：is_error，不新增申請', async () => {
  const { pending, call, unchanged } = setup()
  const r = await call('request_cancel', { order_id: 3 })
  assert.equal(r.is_error, true, '3 號訂單是 preparing，不能取消')
  const doneOrder = await call('request_cancel', { order_id: 1 })
  assert.equal(doneOrder.is_error, true, '1 號訂單已經取餐（done），也不能取消：只有 received 可以申請，不要只擋 preparing')
  for (const input of [{ order_id: '7' }, { order_id: 7.5 }, {}]) {
    const bad = await call('request_cancel', input)
    assert.equal(bad.is_error, true, `input ${JSON.stringify(input)} 不合法：用 zod 驗證，order_id 要是正整數`)
  }
  assert.deepEqual(pending.list(), [], '失敗時不能新增申請')
  unchanged()
})
