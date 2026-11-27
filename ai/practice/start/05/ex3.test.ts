import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import Anthropic from '@anthropic-ai/sdk'
import { fakeAnthropic } from '../../helpers/fake-anthropic.ts'
import { apiError, message, refusal, text, thinking } from '../../helpers/replies.ts'
import { SYSTEM } from './ex1.ts'
import { extractWithRetry } from './ex3.ts'

const plain = (c: unknown) => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join('') : undefined
const reply = (obj: unknown) => message([thinking(), text(JSON.stringify(obj))])
const roles = (msgs: Array<{ role: string }>) => msgs.map(m => m.role).join(',')
const GOOD = { intent: 'order', items: [{ product: '拿鐵', quantity: 2 }], note: null }
const ZERO = { intent: 'order', items: [{ product: '拿鐵', quantity: 0 }], note: null }
const MOCHA = { intent: 'order', items: [{ product: '摩卡', quantity: 1 }], note: null }

test('第一次就對：attempts 是 1，只送一個請求', async () => {
  const { client, requests } = fakeAnthropic([reply(GOOD)])
  const r = await extractWithRetry(client, '兩杯拿鐵')
  assert.deepEqual(r, { ok: true, intent: GOOD, attempts: 1 }, 'attempts 是實際送出的請求數，第一次成功就是 1')
  const body = requests[0].body
  assert.equal(body.model, 'claude-opus-5-5')
  assert.equal(body.max_tokens, 16000)
  assert.equal(plain(body.system), SYSTEM, 'system 要用 SYSTEM')
  assert.equal(body.output_config?.format?.type, 'json_schema', '重試版也要用 output_config: { format: zodOutputFormat(OrderIntentSchema) }')
  assert.equal('output_format' in body, false, 'output_format 已經淘汰')
})

test('第一次 quantity 0、第二次正確：把錯誤回饋給模型後成功', async () => {
  const first = reply(ZERO)
  const { client, requests } = fakeAnthropic([first, reply(GOOD)])
  const r = await extractWithRetry(client, '兩杯拿鐵')
  assert.deepEqual(r, { ok: true, intent: GOOD, attempts: 2 })
  assert.equal(requests.length, 2)
  const msgs = requests[1].body.messages
  assert.equal(roles(msgs), 'user,assistant,user', '重試的請求要是：原本的 user、上一次的 assistant 回應、說明錯誤的 user（不能送完全一樣的請求）')
  assert.deepEqual(msgs[0], requests[0].body.messages[0], '第一則 user 訊息不變')
  assert.deepEqual(msgs[1].content, first.content, 'assistant 要放上一次回應的完整 content（包括 thinking block）')
  assert.match(plain(msgs[2].content) ?? '', /quantity/, '說明錯誤的 user 訊息要包含驗證錯誤的內容（例如錯誤的 message），模型才知道要改哪裡')
  assert.deepEqual(requests[1].body.output_config, requests[0].body.output_config, '重試時 output_config 一樣要帶')
})

test('三次都錯：剛好 3 個請求，回傳 ok: false 與最後一次的錯誤', async () => {
  const { client, requests } = fakeAnthropic([reply(ZERO), reply(ZERO), reply(MOCHA)])
  const r = await extractWithRetry(client, '來一杯')
  assert.equal(requests.length, 3, 'maxAttempts 預設 3：最多送 3 次，不能無限重試')
  assert.equal(r.ok, false)
  assert.equal(r.attempts, 3)
  if (!r.ok) assert.match(r.lastError, /product/, 'lastError 要是最後一次（第 3 次，product 不在菜單）的錯誤訊息')
  assert.equal(roles(requests[2].body.messages), 'user,assistant,user,assistant,user', '第 3 次請求要帶著前兩次的回應與錯誤說明')
})

test('maxAttempts: 2 時最多送 2 次', async () => {
  const { client, requests } = fakeAnthropic([reply(ZERO), reply(ZERO)])
  const r = await extractWithRetry(client, '來一杯', { maxAttempts: 2 })
  assert.equal(requests.length, 2, '要照 opts.maxAttempts 決定上限')
  assert.deepEqual({ ok: r.ok, attempts: r.attempts }, { ok: false, attempts: 2 })
})

test('回答被截斷（max_tokens）也算驗證失敗，可以重試', async () => {
  const { client, requests } = fakeAnthropic([
    message([thinking(), text('{"intent":"order","items":[{"pro')], { stop_reason: 'max_tokens' }),
    reply(GOOD),
  ])
  const r = await extractWithRetry(client, '兩杯拿鐵')
  assert.deepEqual(r, { ok: true, intent: GOOD, attempts: 2 }, 'JSON 被截斷時 format.parse 會丟 AnthropicError，跟驗證失敗一樣處理')
  assert.equal(requests.length, 2)
})

test('400（請求本身錯誤）直接往外丟，不重試', async () => {
  const { client, requests } = fakeAnthropic([apiError(400, 'invalid_request_error', 'output_config.format: invalid schema')])
  await assert.rejects(extractWithRetry(client, '兩杯拿鐵'), Anthropic.BadRequestError, '400 是你的請求有問題，重試只會一直失敗：不要 catch，讓它往外丟')
  assert.equal(requests.length, 1, '400 不能重試')
})

test('529（API 過載）也往外丟：那是 SDK maxRetries 與第 14 課的事，不是回饋重試', async () => {
  const { client, requests } = fakeAnthropic([apiError(529, 'overloaded_error', 'Overloaded')])
  await assert.rejects(extractWithRetry(client, '兩杯拿鐵'), Anthropic.InternalServerError, 'API 錯誤不要吞掉，也不要變成回饋重試')
  assert.equal(requests.length, 1)
})

test('拒答（refusal）不重試：回傳 ok: false', async () => {
  const { client, requests } = fakeAnthropic([refusal('general_harms')])
  const r = await extractWithRetry(client, '……')
  assert.equal(requests.length, 1, 'stop_reason 是 refusal 時再問一次通常還是拒答，不要重試')
  assert.equal(r.ok, false)
  assert.equal(r.attempts, 1)
  if (!r.ok) assert.match(r.lastError, /refusal/, 'lastError 要包含 refusal，呼叫端才知道原因')
})
