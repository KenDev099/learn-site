import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import Anthropic from '@anthropic-ai/sdk'
import { fakeAnthropic, type Step } from '../../helpers/fake-anthropic.ts'
import { apiError, errorEvent, sse, textEvents } from '../../helpers/replies.ts'
import { classify } from './ex1.ts'

const params = { model: 'claude-opus-5-5', max_tokens: 1024, messages: [{ role: 'user' as const, content: '拿鐵多少錢？' }] }

// 用真的 SDK 打假的 API，拿到 SDK 實際丟出的錯誤物件
async function caught(step: Step, options: { timeout?: number } = {}): Promise<unknown> {
  const { client } = fakeAnthropic([step], options)
  try {
    await client.messages.create(params)
  } catch (err) {
    return err
  }
  assert.fail('測試準備錯誤：這個請求應該要失敗')
}

// 串流已經開始（HTTP 200），中途收到 error 事件
async function caughtMidStream(type: string): Promise<unknown> {
  const events = textEvents(['拿鐵'])
  const { client } = fakeAnthropic([sse([...events.slice(0, 6), errorEvent(type, 'Overloaded')])])
  try {
    await client.messages.stream(params).finalMessage()
  } catch (err) {
    return err
  }
  assert.fail('測試準備錯誤：串流應該要失敗')
}

test('429、529、500、503：可以重試', async () => {
  for (const [status, type] of [[429, 'rate_limit_error'], [529, 'overloaded_error'], [500, 'api_error'], [503, 'api_error']] as const) {
    const err = await caught(apiError(status, type, 'try later', status === 429 ? { 'retry-after': '3' } : {}))
    assert.equal(classify(err), 'retry', `HTTP ${status}（${type}）要回 'retry'：供應商暫時忙不過來，等一下再試會成功。529 是 InternalServerError（status ≥ 500），不要漏掉`)
  }
})

test('408、409：SDK 也會重試的狀態碼，回 retry', async () => {
  for (const [status, type] of [[408, 'timeout_error'], [409, 'conflict_error']] as const) {
    const err = await caught(apiError(status, type, 'try again'))
    assert.equal(classify(err), 'retry', `HTTP ${status} 要回 'retry'：跟 SDK 的重試規則一樣（408 請求逾時、409 衝突），不是只有 RateLimitError 與 InternalServerError。用 .status 判斷`)
  }
})

test('連線失敗與逾時：可以重試', async () => {
  const conn = await caught(() => { throw new TypeError('fetch failed') })
  assert.ok(conn instanceof Anthropic.APIConnectionError, '測試準備錯誤：應該拿到 APIConnectionError')
  assert.equal(classify(conn), 'retry', '連線失敗（APIConnectionError）要回 \'retry\'：請求可能根本沒送到')
  const hang: Step = req => new Promise((_, reject) => req.signal?.addEventListener('abort', () => reject(req.signal?.reason)))
  const timeout = await caught(hang, { timeout: 30 })
  assert.ok(timeout instanceof Anthropic.APIConnectionTimeoutError, '測試準備錯誤：應該拿到 APIConnectionTimeoutError')
  assert.equal(classify(timeout), 'retry', '逾時（APIConnectionTimeoutError，是 APIConnectionError 的子類別）要回 \'retry\'')
})

test('串流中途的 overloaded_error、api_error：可以重試；其他 type 不要重試', async () => {
  const overloaded = await caughtMidStream('overloaded_error')
  assert.ok(overloaded instanceof Anthropic.APIError, '測試準備錯誤：應該拿到 APIError')
  assert.equal((overloaded as { status?: number }).status, undefined, '測試準備錯誤：串流中途的錯誤沒有 HTTP status')
  assert.equal(classify(overloaded), 'retry', '串流中途的錯誤 status 是 undefined（HTTP 早就回 200 了），要看 .type：overloaded_error 回 \'retry\'')
  assert.equal(classify(await caughtMidStream('api_error')), 'retry', '串流中途的 api_error 也回 \'retry\'')
  assert.equal(classify(await caughtMidStream('invalid_request_error')), 'fail', '串流中途的其他 type（例如 invalid_request_error）回 \'fail\'')
})

test('400、401、403、404：不要重試', async () => {
  for (const [status, type] of [[400, 'invalid_request_error'], [401, 'authentication_error'], [403, 'permission_error'], [404, 'not_found_error']] as const) {
    const err = await caught(apiError(status, type, 'rate limit settings are invalid'))
    assert.equal(classify(err), 'fail', `HTTP ${status}（${type}）要回 'fail'：請求本身有問題，重送只會得到一樣的結果（也不要因為訊息裡有 rate 就當成限流）`)
  }
})

test('使用者中斷（APIUserAbortError）：不要重試', async () => {
  const controller = new AbortController()
  controller.abort()   // 例如顧客關掉了頁面
  const { client } = fakeAnthropic([apiError(529, 'overloaded_error', 'Overloaded')])
  let err: unknown
  try { await client.messages.create(params, { signal: controller.signal }) } catch (e) { err = e }
  assert.ok(err instanceof Anthropic.APIUserAbortError, '測試準備錯誤：應該拿到 APIUserAbortError')
  assert.equal(classify(err), 'fail', 'APIUserAbortError 要回 \'fail\'：是你的程式（或顧客關掉頁面）要求停下來的，不能再送一次。它也是 APIError 的子類別，要先判斷')
})

test('不是 SDK 的錯誤：unknown（不看訊息內容）', () => {
  assert.equal(classify(new Error('429 rate limit exceeded')), 'unknown', '訊息裡有 rate limit 的普通 Error 不是 API 錯誤，要回 \'unknown\'：用 instanceof 判斷，不要比對訊息')
  assert.equal(classify(new TypeError('Cannot read properties of undefined')), 'unknown')
  assert.equal(classify('overloaded_error'), 'unknown', '丟出的不一定是 Error 物件')
  assert.equal(classify(undefined), 'unknown')
})
