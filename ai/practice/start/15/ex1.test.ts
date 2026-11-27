import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import Anthropic from '@anthropic-ai/sdk'
import { message, refusal, text, thinking, toolUse } from '../../helpers/replies.ts'
import { toLogRecord } from './ex1.ts'
import type { CallInfo } from './ex1.ts'

const KEYS = ['answer', 'at', 'cacheReadTokens', 'cacheWriteTokens', 'costUsd', 'errorType', 'inputTokens', 'latencyMs', 'model',
  'outputTokens', 'promptVersion', 'question', 'refusalCategory', 'requestId', 'route', 'status', 'stopReason', 'toolCalls', 'ttftMs']

const base: CallInfo = {
  route: '/chat', promptVersion: 'support-v3', model: 'claude-opus-5-5',
  startedAt: Date.UTC(2026, 10, 1, 2, 0, 0), endedAt: Date.UTC(2026, 10, 1, 2, 0, 0) + 2350, ttftMs: 820,
  question: '拿鐵多少錢？',
}

// log 要能直接 JSON.stringify：欄位固定、值只有字串、數字、null、字串陣列
function checkShape(rec: unknown) {
  assert.deepEqual(Object.keys(rec as object).sort(), KEYS,
    'log 的欄位要剛好是 LlmLog 的那些：不要漏掉（例如 promptVersion、requestId），也不要多放東西（例如整個 error 或 message 物件）')
  for (const [k, v] of Object.entries(rec as object)) {
    const ok = v === null || ['string', 'number'].includes(typeof v) || (Array.isArray(v) && v.every(x => typeof x === 'string'))
    assert.ok(ok, `欄位 ${k} 只能是字串、數字、null 或字串陣列，不能放物件（error、headers 這類物件可能帶著 key，也序列化不出有用的內容）`)
  }
  assert.deepEqual(JSON.parse(JSON.stringify(rec)), rec, 'JSON.stringify 後要原樣還原得回來')
}

test('成功的呼叫：時間、延遲、usage、費用、stop_reason、工具、request id、prompt 版本都要記下', () => {
  const msg = message([thinking(), toolUse('toolu_1', 'get_my_orders', {}), text('您最近一筆訂單已完成。')], {
    stop_reason: 'end_turn', usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 8000, cache_creation_input_tokens: 500 },
  })
  const rec = toLogRecord({ ...base, message: msg, requestId: 'req_abc123', answer: '您最近一筆訂單已完成。' })
  checkShape(rec)
  assert.equal(rec.at, '2026-11-01T02:00:00.000Z', 'at 是開始時間的 ISO 字串：new Date(startedAt).toISOString()')
  assert.equal(rec.route, '/chat')
  assert.equal(rec.promptVersion, 'support-v3', '要記 promptVersion：出事時才知道是哪一版 prompt')
  assert.equal(rec.model, 'claude-opus-5-5')
  assert.equal(rec.status, 'ok')
  assert.equal(rec.latencyMs, 2350, 'latencyMs = endedAt - startedAt')
  assert.equal(rec.ttftMs, 820)
  assert.equal(rec.requestId, 'req_abc123', 'requestId 用傳進來的 info.requestId')
  assert.equal(rec.stopReason, 'end_turn')
  assert.equal(rec.refusalCategory, null)
  assert.equal(rec.errorType, null, '成功時 errorType 是 null')
  assert.deepEqual([rec.inputTokens, rec.outputTokens, rec.cacheReadTokens, rec.cacheWriteTokens], [1200, 300, 8000, 500], 'token 從 message.usage 讀：input、output、cache_read、cache_creation')
  assert.equal(rec.costUsd, 0.0149, '費用用 costOf：1200×4＋300×20＋8000×0.2＋500×5，除以一百萬')
  assert.deepEqual(rec.toolCalls, ['get_my_orders'], 'toolCalls 是 tool_use block 的 name（content 第一個 block 是 thinking，要過濾 type）')
  assert.equal(rec.question, '拿鐵多少錢？')
  assert.equal(rec.answer, '您最近一筆訂單已完成。')
})

test('費用依 info.model 的價格算，不是固定用 Opus', () => {
  const msg = message([thinking(), text('好的')], { usage: { input_tokens: 1000, output_tokens: 100 } })
  const rec = toLogRecord({ ...base, model: 'claude-sonnet-5-5', message: msg })
  assert.equal(rec.model, 'claude-sonnet-5-5')
  assert.equal(rec.costUsd, 0.003, 'costOf 的第二個參數要傳 info.model：Sonnet 5.5 是 1000×2＋100×10，除以一百萬')
})

test('只有 error、沒有 message：不能讀 message.usage，token 與費用是 0，記下錯誤類型', () => {
  const err = new Anthropic.InternalServerError(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, 'Overloaded',
    new Headers({ 'request-id': 'req_err_9', authorization: 'Bearer sk-ant-secret' }), 'overloaded_error')
  const rec = toLogRecord({ ...base, error: err })
  checkShape(rec)
  assert.equal(rec.status, 'error')
  assert.equal(rec.errorType, 'overloaded_error', 'API 錯誤記 error.type（例如 overloaded_error），不要比對或記錄整段訊息')
  assert.equal(rec.requestId, 'req_err_9', '沒有傳 requestId 時，API 錯誤要用 error.requestID：失敗的請求最需要 request id')
  assert.deepEqual([rec.inputTokens, rec.outputTokens, rec.costUsd], [0, 0, 0], '沒有 message 時 token 與費用都是 0')
  assert.equal(rec.stopReason, null)
  assert.deepEqual(rec.toolCalls, [])
  assert.equal(rec.answer, null, '沒有 answer 時是 null')
  assert.ok(!JSON.stringify(rec).includes('sk-ant'), 'log 裡不能出現金鑰：不要把 error 物件（含 headers）整個放進來')

  const plain = toLogRecord({ ...base, error: new TypeError('x is undefined') })
  checkShape(plain)
  assert.equal(plain.errorType, 'TypeError', '不是 API 錯誤的 Error 用 error.name')
  assert.equal(plain.requestId, null, '沒有 request id 時是 null，不是 undefined')
  assert.equal(toLogRecord({ ...base, error: 'boom' }).errorType, 'unknown', '丟出來的不是 Error（例如字串）時寫 unknown')
})

test('中斷：APIUserAbortError 記成 client_aborted，不算錯誤', () => {
  const rec = toLogRecord({ ...base, error: new Anthropic.APIUserAbortError(), answer: '拿鐵一杯' })
  checkShape(rec)
  assert.equal(rec.status, 'client_aborted', '使用者離開不是系統錯誤，要分開記，錯誤率才不會被灌高')
  assert.equal(rec.errorType, null, 'client_aborted 的 errorType 是 null')
  assert.equal(rec.answer, '拿鐵一杯', '中斷前已經送出的文字也要記')
})

test('拒答：status 是 refusal，記下 category', () => {
  const rec = toLogRecord({ ...base, message: refusal('cyber', null, [thinking()]) })
  checkShape(rec)
  assert.equal(rec.status, 'refusal', 'HTTP 200 但 stop_reason 是 refusal：要算成拒答，不是 ok')
  assert.equal(rec.stopReason, 'refusal')
  assert.equal(rec.refusalCategory, 'cyber', 'refusalCategory 從 stop_details.category 讀')
  assert.equal(rec.errorType, null)
  const noDetails = toLogRecord({ ...base, message: refusal(undefined) })
  assert.equal(noDetails.refusalCategory, null, 'stop_details 是 null 時 refusalCategory 是 null，不能丟錯')
})

test('個資先遮蔽、再截斷到 500 個字元', () => {
  const rec = toLogRecord({ ...base, message: message([thinking(), text('好的')]),
    question: '我是王小明，電話 0912-345-678，Email ming@mail.example.com，幫我查訂單', answer: '已寄到 ming@mail.example.com，會打 0912345678 給您' })
  assert.equal(rec.question, '我是王小明，電話 [電話]，Email [Email]，幫我查訂單', 'question 要先用 redactPII 遮蔽')
  assert.equal(rec.answer, '已寄到 [Email]，會打 [電話] 給您', 'answer 也要遮蔽：模型可能把個資複述一次')

  const long = toLogRecord({ ...base, message: message([thinking(), text('a')]), question: '問'.repeat(2000), answer: '答'.repeat(3000) })
  assert.equal(long.question, '問'.repeat(500), '超過 500 個字元的 question 只留前 500 個')
  assert.equal(long.answer, '答'.repeat(500), '超過 500 個字元的 answer 只留前 500 個')

  // 電話剛好跨過第 500 個字元：先截斷的話剩下「09123」，遮蔽就認不出來
  const edge = toLogRecord({ ...base, question: 'x'.repeat(495) + '0912345678', error: new Error('x') })
  assert.ok(!edge.question.includes('0912'), '要先遮蔽再截斷：先截斷的話，被切掉一半的電話號碼認不出來，前幾碼會留在 log 裡')
  assert.ok(edge.question.length <= 500, '遮蔽後也要截斷到 500 個字元以內')
})
