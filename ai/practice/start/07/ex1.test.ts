import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import type Anthropic from '@anthropic-ai/sdk'
import { fakeAnthropic } from '../../helpers/fake-anthropic.ts'
import { message, text, thinking, toolUse } from '../../helpers/replies.ts'
import { MENU } from '../../helpers/coffee.ts'
import type { ToolSet } from './tools.ts'
import { runAgent } from './ex1.ts'

const roles = (msgs: Array<{ role: string }>) => msgs.map(m => m.role).join(',')

function coffeeTools() {
  const calls: Array<{ name: string; input: unknown }> = []
  const definitions: Anthropic.Tool[] = [
    { name: 'get_menu', description: '列出咖啡店目前的菜單與價格。顧客問價格或品項時使用。', input_schema: { type: 'object', properties: {}, additionalProperties: false }, strict: true },
    { name: 'get_order_status', description: '查一張訂單的狀態。顧客問自己的訂單好了沒時使用，需要訂單編號。', input_schema: { type: 'object', properties: { order_id: { type: 'integer' } }, required: ['order_id'], additionalProperties: false }, strict: true },
  ]
  const tools: ToolSet = {
    definitions,
    handlers: {
      get_menu: input => { calls.push({ name: 'get_menu', input }); return MENU },
      get_order_status: input => { calls.push({ name: 'get_order_status', input }); return { status: 'ready' } },
    },
  }
  return { tools, calls }
}

test('連續 3 輪工具之後回答：回傳 done、turns 4，每輪都把 assistant 與 tool_result 加進對話', async () => {
  const r1 = message([thinking(), toolUse('tu_1', 'get_order_status', { order_id: 3 })], { stop_reason: 'tool_use' })
  const r2 = message([thinking(), text('我再查菜單。'), toolUse('tu_2', 'get_menu', {})], { stop_reason: 'tool_use' })
  const r3 = message([thinking(), toolUse('tu_3', 'get_order_status', { order_id: 7 }), toolUse('tu_4', 'get_menu', {})], { stop_reason: 'tool_use' })
  const r4 = message([thinking(), text('兩張訂單都好了，'), text('可以來取餐。')])
  const { client, requests } = fakeAnthropic([r1, r2, r3, r4])
  const { tools, calls } = coffeeTools()
  const result = await runAgent(client, '我的 3 號和 7 號訂單好了嗎？', tools, { maxTurns: 8 })
  assert.deepEqual(result, { status: 'done', text: '兩張訂單都好了，可以來取餐。', turns: 4 }, '模型不再呼叫工具時回傳 { status: "done", text, turns }，turns 是送出的請求數')
  assert.equal(requests.length, 4, '應該剛好送出 4 個請求')
  assert.equal(calls.length, 4, '4 個 tool_use 都要執行（第 3 輪有兩個）')
  const last = requests[3].body.messages
  assert.equal(last.length, 7, '第 4 個請求的 messages 要有 7 則：問題＋3 組（assistant、tool_result）')
  assert.equal(roles(last), 'user,assistant,user,assistant,user,assistant,user', 'messages 的角色要交錯：每輪先加 assistant（模型的回應），再加 user（tool_result）')
  assert.deepEqual(last[1].content, r1.content, 'assistant 訊息要放回應的完整 content（包括 thinking 與 tool_use block），tool_result 才對得上 id')
  assert.deepEqual(last[5].content, r3.content)
  assert.deepEqual(last[6].content.map((b: any) => [b.type, b.tool_use_id]), [['tool_result', 'tu_3'], ['tool_result', 'tu_4']], '同一輪的兩個 tool_result 放在同一則 user 訊息，順序跟 tool_use 一樣（用 runTools）')
  for (const [i, req] of requests.entries()) {
    assert.equal(req.body.model, 'claude-opus-5-5', `第 ${i + 1} 個請求的 model 要是 MODEL`)
    assert.equal(req.body.max_tokens, 16000, `第 ${i + 1} 個請求的 max_tokens 要是 16000`)
    assert.deepEqual(req.body.tools, tools.definitions, `第 ${i + 1} 個請求要帶 tools：模型每一輪都要知道有哪些工具`)
    assert.equal('temperature' in req.body, false, '不要送 temperature')
  }
})

test('模型一直要用工具：maxTurns 3 時剛好送出 3 個請求，回傳 max_turns，不丟錯', async () => {
  let n = 0
  const again = () => message([thinking(), toolUse(`tu_${++n}`, 'get_menu', {})], { stop_reason: 'tool_use' })
  const { client, requests } = fakeAnthropic([again, again, again])
  const { tools, calls } = coffeeTools()
  let result
  try {
    result = await runAgent(client, '菜單？', tools, { maxTurns: 3 })
  } catch (err) {
    assert.fail(`到了輪數上限要回傳 { status: 'max_turns' }，不要丟錯（或多送請求）：${(err as Error).message}`)
  }
  assert.equal(requests.length, 3, `maxTurns 是 3，應該剛好送出 3 個請求，你的程式送了 ${requests.length} 個`)
  assert.deepEqual(result, { status: 'max_turns', turns: 3 }, '到了上限回傳 { status: "max_turns", turns: maxTurns }')
  assert.equal(calls.length, 2, '第 3 輪（最後一輪）的工具不要執行：結果已經送不出去，有副作用的工具更不能白做')
})

test('模型直接回答：只送 1 個請求，turns 1', async () => {
  const { client, requests } = fakeAnthropic([message([thinking(), text('拿鐵 110 元。')])])
  const { tools } = coffeeTools()
  assert.deepEqual(await runAgent(client, '拿鐵多少？', tools, { maxTurns: 5 }), { status: 'done', text: '拿鐵 110 元。', turns: 1 })
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0].body.messages, [{ role: 'user', content: '拿鐵多少？' }], '第一個請求只有顧客的問題')
})

test('最後的回答被截斷（max_tokens）時丟錯，不當成完成', async () => {
  const { client } = fakeAnthropic([
    message([thinking(), toolUse('tu_1', 'get_menu', {})], { stop_reason: 'tool_use' }),
    message([thinking(), text('菜單有美式')], { stop_reason: 'max_tokens' }),
  ])
  const { tools } = coffeeTools()
  await assert.rejects(runAgent(client, '菜單？', tools, { maxTurns: 5 }), { name: 'TruncatedError' }, '不是 tool_use 的回應要交給 readAnswer：被截斷的回答不能回傳成 done')
})
