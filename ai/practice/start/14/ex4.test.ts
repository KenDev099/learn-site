import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { message, refusal, text, thinking } from '../../helpers/replies.ts'
import { TruncatedError } from './read-answer.ts'
import { handleReply, REFUSAL_MESSAGE } from './ex4.ts'

const EXPLANATION = 'The request asks for instructions to bypass the POS system authentication.'

function run(m: Parameters<typeof handleReply>[0]) {
  const logs: object[] = []
  const reply = handleReply(m, e => logs.push(e))
  return { reply, logs }
}

test('refusal（category cyber）：回傳固定的中性訊息，記錄 category 與 messageId', () => {
  const m = refusal('cyber', EXPLANATION, [thinking(), text('好的，第一步是')])
  const { reply, logs } = run(m)
  assert.equal(reply.kind, 'refused', 'stop_reason 是 refusal 時要回傳 kind: refused：HTTP 雖然是 200，但這不是答案')
  assert.equal((reply as { userMessage: string }).userMessage, REFUSAL_MESSAGE, 'userMessage 要是固定的 REFUSAL_MESSAGE')
  assert.ok(!JSON.stringify(reply).includes('bypass'), '不要把 explanation 給使用者看：它是給你除錯用的，可能透露判斷的細節')
  assert.ok(!JSON.stringify(reply).includes('第一步'), '拒答時 content 裡的文字不能當答案（可能是停下前產生的片段）')
  assert.deepEqual(logs, [{ event: 'refusal', category: 'cyber', messageId: m.id }], 'log 要剛好被呼叫一次，參數是 { event: \'refusal\', category, messageId }')
})

test('refusal 但 stop_details 是 null：不會出錯，category 記成 null', () => {
  const m = refusal(undefined)
  assert.equal(m.stop_details, null, '測試準備錯誤')
  let result
  try {
    result = run(m)
  } catch (err) {
    assert.fail(`stop_details 可能是 null，要用 ?. 讀 category：${(err as Error).message}`)
  }
  assert.deepEqual(result.reply, { kind: 'refused', userMessage: REFUSAL_MESSAGE })
  assert.deepEqual(result.logs, [{ event: 'refusal', category: null, messageId: m.id }], 'stop_details 是 null 時，category 記 null（也要記錄）')
})

test('refusal 的 category 是 null（沒有對應類別）也要記錄', () => {
  const m = refusal(null, null)
  const { reply, logs } = run(m)
  assert.equal(reply.kind, 'refused')
  assert.deepEqual(logs, [{ event: 'refusal', category: null, messageId: m.id }])
})

test('end_turn：回傳 readAnswer 的文字，不記 refusal', () => {
  const m = message([thinking(), text('拿鐵 110 元，'), text('可以換燕麥奶。')])
  const { reply, logs } = run(m)
  assert.deepEqual(reply, { kind: 'answer', text: '拿鐵 110 元，可以換燕麥奶。' }, '其他 stop_reason 用 readAnswer 取文字（第一個 block 是 thinking）')
  assert.deepEqual(logs, [], '正常回答不要記 refusal')
})

test('max_tokens：交給 readAnswer 丟出 TruncatedError，不要當成拒答或答案', () => {
  const m = message([thinking(), text('拿鐵 110')], { stop_reason: 'max_tokens' })
  assert.throws(() => run(m), TruncatedError, '截斷的回答用 readAnswer 處理（丟出 TruncatedError）')
})
