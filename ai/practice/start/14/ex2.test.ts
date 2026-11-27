import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import Anthropic from '@anthropic-ai/sdk'
import { fakeAnthropic, type FakeRequest, type Step } from '../../helpers/fake-anthropic.ts'
import { fakeClock } from '../../helpers/clock.ts'
import { apiError, message, text, thinking } from '../../helpers/replies.ts'
import { TruncatedError } from './read-answer.ts'
import { answerWithFallback, CANNED, SYSTEM } from './ex2.ts'

const Q = '燕麥拿鐵還有嗎？'
const overloaded = () => apiError(529, 'overloaded_error', 'Overloaded')
const plain = (c: unknown) => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join('') : undefined

function setup(primary: Step[], secondary: Step[]) {
  const p = fakeAnthropic(primary)
  const s = fakeAnthropic(secondary)
  const clock = fakeClock()
  return { p, s, clock, clients: { primary: p.client, secondary: s.client } }
}

function checkBody(req: FakeRequest, model: string, who: string) {
  assert.equal(req.body.model, model, `${who}的請求 model 要是 ${model}`)
  assert.equal(req.body.max_tokens, 16000, `${who}的請求 max_tokens 要是 16000`)
  assert.equal(req.body.system, SYSTEM, `${who}的請求要帶 system: SYSTEM`)
  assert.equal(req.body.messages.length, 1, `${who}的請求只有一則 user 訊息`)
  assert.equal(req.body.messages[0].role, 'user')
  assert.equal(plain(req.body.messages[0].content), Q, `${who}的請求內容要是顧客的問題`)
  assert.equal('temperature' in req.body, false, '不要送 temperature')
}

test('主要模型成功：只送 1 個請求，回傳 by primary', async () => {
  const { p, s, clock, clients } = setup([message([thinking(), text('還有，'), text('燕麥拿鐵 120 元。')])], [])
  const result = await answerWithFallback(clients, Q, { deadlineMs: 15_000, now: clock.now })
  assert.deepEqual(result, { by: 'primary', text: '還有，燕麥拿鐵 120 元。' }, '用 readAnswer 取全部 text block 的文字（第一個 block 是 thinking）')
  assert.equal(p.requests.length, 1)
  assert.equal(s.requests.length, 0, '主要模型成功時不要呼叫備用模型')
  checkBody(p.requests[0], 'claude-opus-5-5', '主要模型')
})

test('主要模型 529：改用備用模型（Sonnet），各只送 1 個請求', async () => {
  const { p, s, clock, clients } = setup([overloaded()], [message([thinking(), text('還有喔。')], { model: 'claude-sonnet-5-5' })])
  const result = await answerWithFallback(clients, Q, { deadlineMs: 15_000, now: clock.now })
  assert.deepEqual(result, { by: 'secondary', text: '還有喔。' })
  assert.equal(p.requests.length, 1, '主要模型 529 之後不要再對它重送：換備用模型')
  assert.equal(s.requests.length, 1)
  checkBody(s.requests[0], 'claude-sonnet-5-5', '備用模型')
})

test('主要模型連線失敗也改用備用模型', async () => {
  const { s, clock, clients } = setup([() => { throw new TypeError('fetch failed') }], [message([thinking(), text('還有喔。')])])
  const result = await answerWithFallback(clients, Q, { deadlineMs: 15_000, now: clock.now })
  assert.equal(result.by, 'secondary', '連線錯誤（retry 類）也要改用備用模型')
  assert.equal(s.requests.length, 1)
})

test('兩個模型都 529：回傳預先準備的回覆，不丟錯', async () => {
  const { p, s, clock, clients } = setup([overloaded()], [apiError(429, 'rate_limit_error', 'Rate limited', { 'retry-after': '20' })])
  let result
  try {
    result = await answerWithFallback(clients, Q, { deadlineMs: 15_000, now: clock.now })
  } catch (err) {
    assert.fail(`兩個模型都失敗時要回傳 { by: 'canned', text: CANNED }，不要丟錯（顧客總要看到一句話）：${(err as Error).message}`)
  }
  assert.deepEqual(result, { by: 'canned', text: CANNED })
  assert.equal(p.requests.length, 1, '每個模型只送 1 次')
  assert.equal(s.requests.length, 1, '每個模型只送 1 次')
})

test('主要模型 400：直接丟出 BadRequestError，不換模型', async () => {
  const { s, clock, clients } = setup([apiError(400, 'invalid_request_error', 'messages: roles must alternate')], [message([thinking(), text('不該用到')])])
  await assert.rejects(
    answerWithFallback(clients, Q, { deadlineMs: 15_000, now: clock.now }),
    Anthropic.BadRequestError,
    '400 是請求本身有問題（程式的 bug），要丟出去讓你修，不是換模型或回 canned',
  )
  assert.equal(s.requests.length, 0, '400 不要改用備用模型：換模型會掩蓋 bug')
})

test('備用模型 400：一樣直接丟出，不要吞成 canned', async () => {
  const { clock, clients } = setup([overloaded()], [apiError(400, 'invalid_request_error', 'model: not found')])
  await assert.rejects(
    answerWithFallback(clients, Q, { deadlineMs: 15_000, now: clock.now }),
    Anthropic.BadRequestError,
    '備用模型的 400 也是程式的 bug：只有 retry 類錯誤才回 canned，其他錯誤照樣往外丟',
  )
})

test('主要模型的回答被截斷（TruncatedError，unknown 類）：直接丟出，不換模型', async () => {
  const { s, clock, clients } = setup([message([thinking(), text('燕麥')], { stop_reason: 'max_tokens' })], [message([thinking(), text('不該用到')])])
  await assert.rejects(
    answerWithFallback(clients, Q, { deadlineMs: 15_000, now: clock.now }),
    TruncatedError,
    'readAnswer 丟的 TruncatedError 不是 API 錯誤（classify 是 unknown），要原樣丟出：只有 retry 類才換模型',
  )
  assert.equal(s.requests.length, 0, 'unknown 類錯誤不要改用備用模型')
})

test('主要模型花了 16 秒才失敗（deadline 15 秒）：不呼叫備用模型，直接 canned', async () => {
  const { s, clock, clients } = setup([() => { clock.advance(16_000); return overloaded() }], [message([thinking(), text('太晚了')])])
  const result = await answerWithFallback(clients, Q, { deadlineMs: 15_000, now: clock.now })
  assert.deepEqual(result, { by: 'canned', text: CANNED })
  assert.equal(s.requests.length, 0, '已經超過 deadline 就不要再送請求：用 opts.now() 算剩下的時間，≤ 0 就停')
})

test('主要模型卡住：請求要帶 timeout（剩下的時間），逾時後改用備用模型', async () => {
  // 主要模型一直不回應，直到 SDK 因為 timeout 中斷請求；3 秒內沒被中斷就回 529，讓測試不會卡住
  const hang: Step = req => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(overloaded()), 3000)
    req.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(req.signal?.reason) })
  })
  const { p, clock, clients } = setup([hang], [message([thinking(), text('還有喔。')])])
  const result = await answerWithFallback(clients, Q, { deadlineMs: 300, now: clock.now })
  assert.equal(p.requests[0].signal?.aborted, true, '主要模型的請求沒有被中斷：create 的第二個參數要帶 { timeout: 剩下的毫秒數 }，不然一個卡住的請求會讓顧客等到 SDK 預設的 10 分鐘')
  assert.equal(result.by, 'secondary', '逾時（APIConnectionTimeoutError）是 retry 類，要改用備用模型')
})

test('主要模型用掉大部分時間：備用模型的 timeout 是「剩下的」時間，不是整個 deadline', async () => {
  // 主要模型花了 14.9 秒才 529，只剩 100 毫秒；備用模型一直不回應，1.5 秒內沒被中斷就回答成功
  const late: Step = req => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(message([thinking(), text('太晚了')])), 1500)
    req.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(req.signal?.reason) })
  })
  const { s, clock, clients } = setup([() => { clock.advance(14_900); return overloaded() }], [late])
  const result = await answerWithFallback(clients, Q, { deadlineMs: 15_000, now: clock.now })
  assert.equal(s.requests[0]?.signal?.aborted, true, '備用模型的請求沒有在剩下的 100 毫秒後被中斷：每個請求送出前重新算 deadlineMs - (now() - 開始時間)，當成它的 timeout')
  assert.deepEqual(result, { by: 'canned', text: CANNED }, '備用模型逾時後回預先準備的回覆')
})
