import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import type Anthropic from '@anthropic-ai/sdk'
import { fakeAnthropic } from '../../helpers/fake-anthropic.ts'
import { message, text, thinking, toolUse } from '../../helpers/replies.ts'
import { fakeClock } from '../../helpers/clock.ts'
import { MENU } from '../../helpers/coffee.ts'
import type { ToolSet } from './tools.ts'
import { runTracedAgent } from './ex4.ts'

// get_menu 花 30ms、get_order_status 花 120ms（用假時鐘，不真的等）；order_id 不是 7 時查詢失敗
function timedTools(clock: ReturnType<typeof fakeClock>) {
  const definitions: Anthropic.Tool[] = [
    { name: 'get_menu', description: '列出咖啡店目前的菜單與價格。顧客問價格或品項時使用。', input_schema: { type: 'object', properties: {}, additionalProperties: false }, strict: true },
    { name: 'get_order_status', description: '查一張訂單的狀態。顧客問自己的訂單好了沒時使用，需要訂單編號。', input_schema: { type: 'object', properties: { order_id: { type: 'integer' } }, required: ['order_id'], additionalProperties: false }, strict: true },
  ]
  const tools: ToolSet = {
    definitions,
    handlers: {
      get_menu: async () => { await clock.sleep(30); return MENU },
      get_order_status: async (input: any) => {
        if (input?.order_id !== 7) throw new Error('找不到這張訂單')
        await clock.sleep(120)
        return { status: 'ready' }
      },
    },
  }
  return tools
}

test('2 輪各 2 個工具（各有一個失敗）：trace 4 筆，turn、isError、ms、usage 都正確', async () => {
  const clock = fakeClock(1_000_000)
  const r3 = message([thinking(), text('7 號訂單好了。')], { usage: { input_tokens: 1000, output_tokens: 40 } })
  const { client, requests } = fakeAnthropic([
    message([thinking(), toolUse('tu_1', 'get_menu', {}), toolUse('tu_2', 'get_order_status', { order_id: 99 })], { stop_reason: 'tool_use', usage: { input_tokens: 500, output_tokens: 80 } }),
    message([thinking(), toolUse('tu_3', 'get_order_status', { order_id: 7 }), toolUse('tu_4', 'refund', { order_id: 7 })], { stop_reason: 'tool_use', usage: { input_tokens: 900, output_tokens: 60 } }),
    r3,
  ])
  const result = await runTracedAgent(client, '7 號訂單好了嗎？', timedTools(clock), { maxTurns: 5, now: clock.now })
  assert.equal(result.status, 'done')
  assert.equal(result.turns, 3)
  assert.ok(Array.isArray(result.trace), '回傳結果要有 trace 陣列')
  assert.deepEqual(result.trace.map(e => [e.turn, e.tool]), [[1, 'get_menu'], [1, 'get_order_status'], [2, 'get_order_status'], [2, 'refund']],
    'trace 每個工具呼叫一筆，順序跟 tool_use 一樣；turn 是第幾個請求（從 1 開始），同一輪的工具 turn 相同')
  assert.deepEqual(result.trace.map(e => e.isError), [false, true, false, true], '失敗的工具（handler 丟錯、沒有這個工具）也要記錄，isError 是 true')
  assert.deepEqual(result.trace.map(e => e.ms), [30, 0, 120, 0], 'ms 用傳進來的 now() 量：執行前記一次、執行完再記一次（不要用 Date.now，測試的時鐘是假的）')
  assert.deepEqual(result.trace.map(e => [e.inputTokens, e.outputTokens]), [[500, 80], [500, 80], [900, 60], [900, 60]], 'inputTokens／outputTokens 記的是「要求這個工具的那一輪」回應的 usage')
  assert.equal(requests.length, 3)
  assert.equal(requests[2].body.messages.length, 5, '工具結果照樣要送回模型')
  assert.deepEqual(requests[2].body.messages[4].content.map((b: any) => [b.tool_use_id, b.is_error === true]), [['tu_3', false], ['tu_4', true]], '同一輪的 tool_result 放在同一則 user 訊息，順序跟 tool_use 一樣')
})

test('到了輪數上限也要回傳 trace', async () => {
  const clock = fakeClock()
  let n = 0
  const again = () => message([thinking(), toolUse(`tu_${++n}`, 'get_menu', {})], { stop_reason: 'tool_use', usage: { input_tokens: 300, output_tokens: 20 } })
  const { client, requests } = fakeAnthropic([again, again])
  const result = await runTracedAgent(client, '菜單？', timedTools(clock), { maxTurns: 2, now: clock.now })
  assert.equal(requests.length, 2, 'maxTurns 2：剛好送 2 個請求')
  assert.equal(result.status, 'max_turns')
  assert.deepEqual(result.trace, [{ turn: 1, tool: 'get_menu', isError: false, ms: 30, inputTokens: 300, outputTokens: 20 }],
    '停在上限時也要回傳 trace（最需要查原因的就是沒完成的任務）；最後一輪的工具沒有執行，所以只有第 1 輪的一筆')
})
