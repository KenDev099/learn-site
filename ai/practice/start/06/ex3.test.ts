import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeAnthropic } from '../../helpers/fake-anthropic.ts'
import { message, text, thinking, toolUse } from '../../helpers/replies.ts'
import { MENU } from '../../helpers/coffee.ts'
import { orderTools } from './ex1.ts'
import { askWithTools, SYSTEM, type OrderStatus } from './ex3.ts'

const plain = (c: unknown) => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join('') : undefined
const roles = (msgs: Array<{ role: string }>) => msgs.map(m => m.role).join(',')
const ORDERS: OrderStatus[] = [
  { id: 3, status: 'ready', items: ['美式咖啡', '可頌'], orderedAt: '2026-11-01T09:00:00+08:00' },
  { id: 5, status: 'preparing', items: ['拿鐵'], orderedAt: '2026-11-01T09:05:00+08:00' },
]
// 假的資料庫：記錄被查了哪些 id
function fakeDb() {
  const calls: unknown[] = []
  return {
    calls,
    deps: { menu: MENU, findOrder: async (id: number) => { calls.push(id); return ORDERS.find(o => o.id === id) ?? null } },
  }
}

test('平行的兩個工具呼叫：執行後把結果送回去，回傳最後的回答', async () => {
  const first = message([thinking(), text('我幫你查。'), toolUse('toolu_a', 'get_order_status', { order_id: 3 }), toolUse('toolu_b', 'get_order_status', { order_id: 5 })], { stop_reason: 'tool_use' })
  const { client, requests } = fakeAnthropic([first, message([thinking(), text('3 號可以取餐了，5 號的拿鐵還在做。')])])
  const db = fakeDb()
  const answer = await askWithTools(client, '我的 3 號和 5 號訂單好了嗎？', db.deps)
  assert.equal(answer, '3 號可以取餐了，5 號的拿鐵還在做。', '要回傳第二次回應的文字')
  assert.equal(requests.length, 2, 'stop_reason 是 tool_use 時，執行工具後要再送一次請求')
  assert.deepEqual(db.calls, [3, 5], '兩個 tool_use 都要執行，用 input 的 order_id 查資料庫')

  const req1 = requests[0].body
  assert.equal(req1.model, 'claude-opus-5-5')
  assert.equal(req1.max_tokens, 16000)
  assert.equal(plain(req1.system), SYSTEM, 'system 要用 SYSTEM')
  assert.equal(roles(req1.messages), 'user', '第一次請求只有一則 user 訊息')
  assert.equal(plain(req1.messages[0].content), '我的 3 號和 5 號訂單好了嗎？')
  assert.deepEqual(req1.tools, JSON.parse(JSON.stringify(orderTools)), '請求要帶 tools: orderTools')
  assert.ok(req1.tool_choice === undefined || req1.tool_choice.type === 'auto', 'tool_choice 不要用 any 或 tool：claude-opus-5-5 會回 400；不寫就是 auto')

  const req2 = requests[1].body
  assert.deepEqual(req2.tools, JSON.parse(JSON.stringify(orderTools)), '第二次請求也要帶同樣的 tools：messages 裡有 tool_use，請求卻沒有 tools 會 400')
  assert.equal(req2.model, 'claude-opus-5-5', '第二次請求也要用 MODEL')
  assert.equal(req2.max_tokens, 16000, '第二次請求的 max_tokens 也是 16000')
  assert.equal(plain(req2.system), SYSTEM, '第二次請求也要帶 system：SYSTEM 是整段對話的規則，每次請求都要送')
  for (const req of [req1, req2]) for (const k of ['temperature', 'top_p', 'top_k']) assert.equal(k in req, false, `不要送 ${k}：API 2026-10-21 會回 400`)
  assert.ok(req2.tool_choice === undefined || req2.tool_choice.type === 'auto', '第二次請求也不要送 any 或 tool')
  assert.equal(roles(req2.messages), 'user,assistant,user', '第二次請求的 messages 要依序是 user、assistant、user：全部的 tool_result 放在同一則 user 訊息，不要拆成好幾則')
  assert.deepEqual(req2.messages[1].content, JSON.parse(JSON.stringify(first.content)), 'assistant 訊息要放第一次回應的完整 content（thinking、text、兩個 tool_use），不是只放文字')
  const results = req2.messages[2].content
  assert.ok(Array.isArray(results), '最後一則 user 訊息的 content 要是 tool_result 陣列')
  assert.deepEqual(results.map((r: any) => [r.type, r.tool_use_id]), [['tool_result', 'toolu_a'], ['tool_result', 'toolu_b']], '兩個 tool_result 依序對應 toolu_a、toolu_b')
  assert.deepEqual(JSON.parse(results[0].content), ORDERS[0], 'toolu_a 的結果是 3 號訂單')
  assert.deepEqual(JSON.parse(results[1].content), ORDERS[1])
  for (const r of results) assert.notEqual(r.is_error, true)
})

test('input 不合法（order_id 是字串、是 0）：不查資料庫，回傳 is_error，get_menu 照常執行', async () => {
  const menu = [{ id: 9, name: '燕麥拿鐵', price: 130 }] as typeof MENU   // 跟 helpers 的 MENU 不同：get_menu 要回傳 deps.menu
  const first = message([thinking(), toolUse('toolu_1', 'get_order_status', { order_id: '12' }), toolUse('toolu_2', 'get_order_status', { order_id: 0 }), toolUse('toolu_3', 'get_menu', {})], { stop_reason: 'tool_use' })
  const { client, requests } = fakeAnthropic([first, message([thinking(), text('請給我正確的訂單編號。')])])
  const db = fakeDb()
  assert.equal(await askWithTools(client, '查 12 號', { ...db.deps, menu }), '請給我正確的訂單編號。')
  assert.deepEqual(db.calls, [], 'input 不合法時不能呼叫 findOrder：先用 GetOrderStatusInput.safeParse 驗證，模型的輸入是不可信的外部資料')
  const results = requests[1].body.messages[2].content
  assert.equal(results.length, 3)
  assert.equal(results[0].is_error, true, "order_id: '12' 要回 is_error: true")
  assert.equal(results[1].is_error, true, 'order_id: 0 要回 is_error: true（不是正整數）')
  assert.notEqual(results[2].is_error, true, 'get_menu 不受影響')
  assert.deepEqual(JSON.parse(results[2].content), menu, 'get_menu 要回傳 deps.menu（呼叫端傳進來的菜單），不是自己 import 的 MENU')
})

test('找不到訂單、資料庫出錯：回傳 is_error 與說明，讓模型決定怎麼回顧客', async () => {
  const first = message([thinking(), toolUse('toolu_1', 'get_order_status', { order_id: 99 }), toolUse('toolu_2', 'get_order_status', { order_id: 7 })], { stop_reason: 'tool_use' })
  const { client, requests } = fakeAnthropic([first, message([thinking(), text('查不到 99 號，7 號暫時查不到，請稍後再試。')])])
  const deps = {
    menu: MENU,
    findOrder: async (id: number) => {
      if (id === 7) throw new Error('資料庫查詢逾時')
      return null
    },
  }
  assert.equal(await askWithTools(client, '99 號和 7 號呢？', deps), '查不到 99 號，7 號暫時查不到，請稍後再試。')
  const results = requests[1].body.messages[2].content
  assert.equal(results[0].is_error, true, 'findOrder 回傳 null（找不到訂單）也要回 is_error: true，不要回 null')
  assert.match(String(results[0].content), /99/, '找不到訂單的說明要包含訂單編號，例如「找不到 99 號訂單」')
  assert.equal(results[1].is_error, true, '資料庫丟錯要回 is_error: true，不能讓整個函式失敗')
  assert.match(String(results[1].content), /逾時/)
})

test('模型直接回答：只送一次請求', async () => {
  const { client, requests } = fakeAnthropic([message([thinking(), text('拿鐵一杯 110 元。')])])
  const db = fakeDb()
  assert.equal(await askWithTools(client, '拿鐵多少錢？', db.deps), '拿鐵一杯 110 元。')
  assert.equal(requests.length, 1, 'stop_reason 是 end_turn 時不用再送請求')
  assert.deepEqual(db.calls, [])
})

test('回應被截斷（max_tokens）時不執行工具，直接丟錯', async () => {
  const cut = message([thinking(), toolUse('toolu_1', 'get_order_status', { order_id: 3 })], { stop_reason: 'max_tokens' })
  const { client, requests } = fakeAnthropic([cut])
  const db = fakeDb()
  await assert.rejects(askWithTools(client, '3 號好了嗎？', db.deps), '被截斷的回應要丟錯：只有 stop_reason 是 tool_use 才執行工具，其他交給 readAnswer')
  assert.deepEqual(db.calls, [], '截斷的 tool_use 可能不完整，不能執行')
  assert.equal(requests.length, 1)
})

test('第二次又要求工具：這題只處理一輪，丟錯', async () => {
  const again = message([thinking(), toolUse('toolu_9', 'get_menu', {})], { stop_reason: 'tool_use' })
  const { client } = fakeAnthropic([message([thinking(), toolUse('toolu_1', 'get_order_status', { order_id: 3 })], { stop_reason: 'tool_use' }), again])
  await assert.rejects(askWithTools(client, '3 號好了嗎？', fakeDb().deps), '第二次回應用 readAnswer 讀：stop_reason 還是 tool_use 時會丟錯，不能回傳空字串')
})
