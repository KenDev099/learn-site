import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import type Anthropic from '@anthropic-ai/sdk'
import { fakeAnthropic } from '../../helpers/fake-anthropic.ts'
import type { FakeRequest } from '../../helpers/fake-anthropic.ts'
import { message, text, thinking, toolUse } from '../../helpers/replies.ts'
import type { ToolSet } from './tools.ts'
import { runGuardedAgent } from './ex2.ts'

function orderTools() {
  const calls: unknown[] = []
  const definitions: Anthropic.Tool[] = [
    { name: 'get_order_status', description: '查一張訂單的狀態。顧客問自己的訂單好了沒時使用，需要訂單編號。', input_schema: { type: 'object', properties: { order_id: { type: 'integer' } }, required: ['order_id'], additionalProperties: false }, strict: true },
  ]
  const tools: ToolSet = { definitions, handlers: { get_order_status: input => { calls.push(input); return { status: 'preparing' } } } }
  return { tools, calls }
}

// 每次都要求查一張訂單；orderIds 決定每輪查哪一張，usage 固定
function lookups(orderIds: number[], usage = { input_tokens: 1000, output_tokens: 200 }) {
  return orderIds.map((id, i) => (_req: FakeRequest) =>
    message([thinking(), toolUse(`tu_${i + 1}`, 'get_order_status', { order_id: id })], { stop_reason: 'tool_use', usage }))
}

async function run(client: Anthropic, tools: ToolSet, opts: { maxTurns: number; maxTokens: number }) {
  try {
    return await runGuardedAgent(client, '我的訂單好了嗎？', tools, opts)
  } catch (err) {
    assert.fail(`停下來時要回傳 status，不要丟錯（也可能是多送了請求）：${(err as Error).message}`)
  }
}

test('token 預算：每輪 1000＋200，預算 3000 → 送完第 3 個請求（累計 3600）就停，回傳 budget', async () => {
  const { client, requests } = fakeAnthropic(lookups([1, 2, 3]))
  const { tools, calls } = orderTools()
  const result = await run(client, tools, { maxTurns: 10, maxTokens: 3000 })
  assert.equal(requests.length, 3, `應該送出 3 個請求，你的程式送了 ${requests.length} 個。預算要算 input_tokens＋output_tokens，而且每輪拿到回應就檢查`)
  assert.deepEqual(result, { status: 'budget', turns: 3, tokens: { input: 3000, output: 600 } }, '回傳 { status: "budget", turns, tokens }，tokens 是全部請求的 usage 加總')
  assert.equal(calls.length, 2, '超過預算的那一輪，工具不要執行：結果不會再送給模型')
})

test('累計剛好等於預算時還可以繼續（大於才停）', async () => {
  const { client, requests } = fakeAnthropic(lookups([1, 2, 3]))
  const { tools } = orderTools()
  const result = await run(client, tools, { maxTurns: 10, maxTokens: 2400 })
  assert.equal(requests.length, 3, '兩輪後累計 2400、剛好等於預算，還要送第 3 個請求；第 3 輪累計 3600 才超過')
  assert.equal(result?.status, 'budget')
})

test('預算內完成：回傳 done、文字與 token 加總', async () => {
  const { client, requests } = fakeAnthropic([
    ...lookups([7]),
    message([thinking(), text('7 號訂單正在製作。')], { usage: { input_tokens: 1300, output_tokens: 50 } }),
  ])
  const { tools } = orderTools()
  const result = await run(client, tools, { maxTurns: 10, maxTokens: 5000 })
  assert.deepEqual(result, { status: 'done', text: '7 號訂單正在製作。', turns: 2, tokens: { input: 2300, output: 250 } })
  assert.equal(requests[1].body.messages.length, 3, '第 2 個請求要帶著 assistant 與 tool_result')
  assert.equal(requests[1].body.model, 'claude-opus-5-5')
  assert.deepEqual(requests[1].body.tools, tools.definitions, '每個請求都要帶 tools')
})

test('同一個工具＋同樣的 input 第 3 次出現：不執行，回傳 loop', async () => {
  const { client, requests } = fakeAnthropic(lookups([1, 1, 1], { input_tokens: 20, output_tokens: 10 }))
  const { tools, calls } = orderTools()
  const result = await run(client, tools, { maxTurns: 10, maxTokens: 100000 })
  assert.equal(requests.length, 3)
  assert.equal(result?.status, 'loop', '同一個工具、JSON.stringify(input) 相同，累計第 3 次時回傳 status: "loop"')
  assert.equal(result?.turns, 3)
  assert.equal(calls.length, 2, '第 3 次重複的呼叫不要執行：先檢查再執行工具')
})

test('名稱相同但 input 不同不算重複', async () => {
  const { client, requests } = fakeAnthropic([
    ...lookups([1, 2, 1, 2], { input_tokens: 20, output_tokens: 10 }),
    message([thinking(), text('兩張都在製作中。')]),
  ])
  const { tools, calls } = orderTools()
  const result = await run(client, tools, { maxTurns: 10, maxTokens: 100000 })
  assert.equal(result?.status, 'done', '查 1 號、2 號各兩次不是卡住：重複的判斷要同時看工具名稱與 input')
  assert.equal(requests.length, 5)
  assert.equal(calls.length, 4)
})

test('重複是「累計」次數，不只看連續：1、2、1、3、1 號的第 3 次查 1 號就停', async () => {
  const { client, requests } = fakeAnthropic(lookups([1, 2, 1, 3, 1], { input_tokens: 20, output_tokens: 10 }))
  const { tools, calls } = orderTools()
  const result = await run(client, tools, { maxTurns: 10, maxTokens: 100000 })
  assert.equal(requests.length, 5)
  assert.equal(result?.status, 'loop', '同一個工具＋input 在這次任務累計出現第 3 次就算卡住，中間穿插別的查詢也一樣：用 Map 記每個 key 的總次數，不要只比上一輪')
  assert.equal(calls.length, 4)
})

test('最後的回答讓累計超過預算：答案已經拿到，回傳 done，不是 budget', async () => {
  const { client } = fakeAnthropic([
    ...lookups([7]),
    message([thinking(), text('7 號訂單正在製作。')], { usage: { input_tokens: 1300, output_tokens: 50 } }),
  ])
  const { tools } = orderTools()
  const result = await run(client, tools, { maxTurns: 10, maxTokens: 2000 })
  assert.equal(result?.status, 'done', '先看 stop_reason：不是 tool_use 就回傳 done。預算是用來擋「下一輪」的，已經付錢拿到的答案不要丟掉')
  assert.equal(result?.text, '7 號訂單正在製作。')
})

test('輪數上限照樣有效：maxTurns 2 時送 2 個請求就停', async () => {
  const { client, requests } = fakeAnthropic(lookups([1, 2]))
  const { tools, calls } = orderTools()
  const result = await run(client, tools, { maxTurns: 2, maxTokens: 100000 })
  assert.equal(requests.length, 2)
  assert.deepEqual(result, { status: 'max_turns', turns: 2, tokens: { input: 2000, output: 400 } })
  assert.equal(calls.length, 1)
})
