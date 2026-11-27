import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CUSTOMERS, ORDERS } from '../../helpers/coffee.ts'
import { toolUse } from '../../helpers/replies.ts'
import { runTool } from './tools.ts'
import { FakeDb, makeSupportTools } from './ex1.ts'
import type { OrderRow, OrderStatus } from './ex1.ts'

// 王小明（顧客 1）有 1、3、7 號訂單；2、6 號是陳美華（顧客 2）的；999 號不存在
const STATUS: Record<number, OrderStatus> = { 1: 'done', 2: 'received', 3: 'preparing', 4: 'ready', 5: 'done', 6: 'received', 7: 'received', 8: 'preparing' }
const ROWS: OrderRow[] = ORDERS.map(o => {
  const c = CUSTOMERS.find(c => c.id === o.customerId)!
  return {
    ...o,
    status: STATUS[o.id],
    customer: { name: c.name, phone: c.phone, email: `customer${c.id}@mail.example` },
    payment: { cardNumber: '4111 1111 1111 1111', cardHolder: c.name },
  }
})
const SECRETS = /09\d\d-\d{3}-\d{3}|@mail\.example|4111|王小明|陳美華|customer|payment|phone|email|card/i
// 錯誤訊息只檢查真正的資料（zod 的錯誤訊息可能提到欄位名稱 customer_id，那不是洩漏）
const DATA = /09\d\d-\d{3}-\d{3}|@mail\.example|4111|王小明|陳美華/

function setup(customerId = 1) {
  const tools = makeSupportTools({ customerId }, new FakeDb(ROWS))
  let n = 0
  const call = (name: string, input: unknown) => runTool(toolUse(`tu_${++n}`, name, input), tools.handlers)
  return { tools, call }
}

test('工具定義：get_my_orders 與 get_order，strict，schema 裡沒有顧客 id', () => {
  const { tools } = setup()
  assert.deepEqual(tools.definitions.map(t => t.name), ['get_my_orders', 'get_order'], '要有 get_my_orders 與 get_order 兩個工具（照這個順序）')
  for (const t of tools.definitions) {
    assert.equal(t.strict, true, `${t.name} 要 strict: true`)
    assert.equal((t.input_schema as any).additionalProperties, false, `${t.name} 的 input_schema 要 additionalProperties: false：模型不能多塞欄位`)
    assert.ok((t.description ?? '').length >= 15, `${t.name} 的 description 要寫清楚做什麼、什麼時候用`)
  }
  assert.deepEqual(Object.keys((tools.definitions[0].input_schema as any).properties ?? {}), [], 'get_my_orders 不需要任何參數')
  assert.deepEqual(tools.definitions[1].input_schema.required, ['order_id'], 'get_order 只需要 order_id')
  assert.doesNotMatch(JSON.stringify(tools.definitions), /customer|user_id|owner/i, '工具定義裡不能有顧客 id：查誰的資料由 session 決定，不讓模型填')
})

test('get_my_orders：只回傳登入顧客的訂單，只有 id、status、total、items（品名與數量）', async () => {
  const { call } = setup(1)
  for (const input of [{}, { customer_id: 2 }]) {
    const r = await call('get_my_orders', input)
    // 多給的 customer_id：直接拒絕（例如 zod 的 .strict()）也可以，但絕不能照它查
    if (r.is_error && 'customer_id' in input) { assert.doesNotMatch(String(r.content), DATA, '錯誤訊息裡不能出現別人的資料'); continue }
    assert.notEqual(r.is_error, true, `get_my_orders 不該失敗：${r.content}`)
    const orders = JSON.parse(String(r.content))
    assert.deepEqual(orders.map((o: any) => o.id), [1, 3, 7], `顧客 1 只能看到 1、3、7 號訂單（input 是 ${JSON.stringify(input)} 時也一樣：不讀模型給的 customer_id）`)
    assert.deepEqual(orders[0], { id: 1, status: 'done', total: 190, items: [{ name: '美式咖啡', quantity: 1 }, { name: '拿鐵', quantity: 1 }] }, '每筆是 { id, status, total, items: [{ name, quantity }] }，品項用 productName 換成名稱')
    assert.doesNotMatch(String(r.content), SECRETS, '回傳給模型的資料不能有電話、Email、卡號、姓名：只挑回答需要的欄位，不要回傳整列')
  }
  const other = JSON.parse(String((await setup(2).call('get_my_orders', {})).content))
  assert.deepEqual(other.map((o: any) => o.id), [2, 6], '顧客 2 登入時看到的是 2、6 號：顧客 id 要用 session.customerId，不能寫死')
})

test('get_order：自己的訂單回傳 OrderView，不含個資與付款資料', async () => {
  const { call } = setup(1)
  const r = await call('get_order', { order_id: 3 })
  assert.notEqual(r.is_error, true, `3 號是顧客 1 的訂單，要查得到：${r.content}`)
  assert.deepEqual(JSON.parse(String(r.content)), { id: 3, status: 'preparing', total: 150, items: [{ name: '美式咖啡', quantity: 1 }, { name: '可頌', quantity: 1 }] }, '回傳 { id, status, total, items: [{ name, quantity }] }')
  assert.doesNotMatch(String(r.content), SECRETS, '不能把電話、Email、卡號、姓名交給模型')
})

test('別人的訂單、不存在的訂單：錯誤訊息完全一樣，模型多給 customer_id 也沒用', async () => {
  const { call } = setup(1)
  const results = []
  for (const input of [{ order_id: 2 }, { order_id: 6 }, { order_id: 999 }, { order_id: 2, customer_id: 2 }, { order_id: 6, customer_id: 2 }]) {
    const r = await call('get_order', input)
    assert.equal(r.is_error, true, `${JSON.stringify(input)}：別人的訂單和不存在的訂單都要失敗（比對訂單的 customerId 跟 session.customerId，不看 input 的 customer_id）`)
    assert.doesNotMatch(String(r.content), DATA, '錯誤訊息裡也不能出現別人的資料')
    if (!('customer_id' in input)) results.push(r.content)
  }
  assert.equal(new Set(results).size, 1, `別人的訂單（2、6 號）和不存在的訂單（999 號）錯誤訊息要一字不差（現在是 ${JSON.stringify([...new Set(results)])}）：訊息不同，攻擊者就能試出哪些訂單編號存在`)
  assert.match(String(results[0]), /找不到這張訂單/, '錯誤訊息用「找不到這張訂單」')
})

test('get_order 不合法的 input：is_error', async () => {
  const { call } = setup(1)
  for (const input of [{ order_id: '3' }, { order_id: 3.5 }, { order_id: -1 }, {}]) {
    const r = await call('get_order', input)
    assert.equal(r.is_error, true, `input ${JSON.stringify(input)} 不合法：用 zod 驗證，order_id 要是正整數`)
  }
})

test('權限檢查寫在程式裡，不是寫在 description', () => {
  const src = readFileSync(new URL('./ex1.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /input\s*(\.|\[\s*['"])customer_?id/i, '不能讀 input 的 customer_id：模型給的身分一律不信')
})
