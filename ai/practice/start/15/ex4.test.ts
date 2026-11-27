import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { fakeAnthropic } from '../../helpers/fake-anthropic.ts'
import { fakeClock } from '../../helpers/clock.ts'
import { errorEvent, sse, textEvents } from '../../helpers/replies.ts'
import type { SseItem } from '../../helpers/replies.ts'
import { createChatServer, PROMPT_VERSION } from './ex3.ts'
import type { LlmLog } from './ex1.ts'

// 這一題做在 ex3.ts，而且會用到練習 1 的 toLogRecord：照順序做

// 伺服器裡沒接住的錯誤會變成 unhandledRejection／uncaughtException，正式環境可能讓整個程序掛掉
const crashes: unknown[] = []
process.on('unhandledRejection', e => { crashes.push(e) })
process.on('uncaughtException', e => { crashes.push(e) })

async function serve(server: http.Server, t: test.TestContext): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

// 測試用 node:http 當前端（offline.ts 把全域 fetch 換掉了）
type Reply = { status: number; headers: http.IncomingHttpHeaders; text: () => string; until: (needle: string) => Promise<void>; end: () => Promise<string> }
function post(base: string, body: unknown, signal?: AbortSignal, path = '/chat'): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal }, res => {
      let text = ''
      let ended = false
      let wake = () => {}
      res.setEncoding('utf8')
      res.on('data', chunk => { text += chunk; wake() })
      res.on('end', () => { ended = true; wake() })
      res.on('error', () => { ended = true; wake() })   // 自己中斷時會觸發，忽略
      const wait = () => new Promise<void>(r => { wake = r })
      resolve({
        status: res.statusCode ?? 0, headers: res.headers, text: () => text,
        async until(needle) { while (!text.includes(needle) && !ended) await wait() },
        async end() { while (!ended) await wait(); return text },
      })
    })
    req.on('error', reject)
    req.end(typeof body === 'string' ? body : JSON.stringify(body))
  })
}

const within = <T>(p: Promise<T>, ms: number, msg: string) => {
  let timer: NodeJS.Timeout
  return Promise.race([p, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(msg)), ms) })]).finally(() => clearTimeout(timer))
}

// 收集 log，並可以等到第 n 筆出現
function logSink() {
  const records: LlmLog[] = []
  let wake = () => {}
  return {
    records,
    log: (r: LlmLog) => { records.push(r); wake() },
    async waitFor(count: number, msg: string) {
      await within((async () => {
        while (records.length < count) await new Promise<void>(resolve => { wake = resolve })
      })(), 10_000, msg)
    },
  }
}

const ask = (url: string, question: string, signal?: AbortSignal) => post(url, { question }, signal)

test('正常結束：記一筆 ok 的 log，時間用 deps.now 量，問題要遮蔽', async t => {
  const clock = fakeClock(1_000_000)
  const events: SseItem[] = textEvents(['拿鐵', '一杯 110 元。'], { usage: { input_tokens: 300, output_tokens: 50 } })
  events.splice(5, 0, () => clock.set(1_000_800))     // 第一段文字在 800ms 時到
  events.splice(-1, 0, () => clock.set(1_002_500))    // 2500ms 時結束
  const reply = sse(events)
  const requestId = reply.headers.get('request-id')
  const { client } = fakeAnthropic([reply])
  const sink = logSink()
  const url = await serve(createChatServer(client, { log: sink.log, now: clock.now }), t)
  await (await ask(url, '拿鐵多少錢？我的電話 0912-345-678')).end()
  await sink.waitFor(1, '回應結束後 10 秒內沒有收到 log：每個請求結束時呼叫一次 deps.log(toLogRecord(…))')
  assert.equal(sink.records.length, 1, '一個請求只記一筆')
  const r = sink.records[0]
  assert.equal(r.status, 'ok')
  assert.equal(r.route, '/chat')
  assert.equal(r.promptVersion, PROMPT_VERSION, 'promptVersion 用 PROMPT_VERSION')
  assert.equal(r.ttftMs, 800, 'ttftMs：用 deps.now() 量，從送出請求前到第一段文字')
  assert.equal(r.latencyMs, 2500, 'latencyMs：用 deps.now() 量，從送出請求前到結束（不要用 Date.now()）')
  assert.equal(r.requestId, requestId, 'requestId 用 stream.request_id（回應標頭 request-id）')
  assert.deepEqual([r.inputTokens, r.outputTokens], [300, 50], '成功時要把 finalMessage 傳給 toLogRecord')
  assert.equal(r.question, '拿鐵多少錢？我的電話 [電話]', '問題要經過 toLogRecord 遮蔽')
  assert.equal(r.answer, '拿鐵一杯 110 元。', 'answer 是送給前端的文字')
})

test('串流出錯：記一筆 error 的 log，錯誤類型只進 log', async t => {
  const events = textEvents(['拿鐵'])
  events.splice(6, 0, errorEvent('overloaded_error', 'Overloaded'))
  const { client } = fakeAnthropic([sse(events)])
  const sink = logSink()
  const url = await serve(createChatServer(client, { log: sink.log, now: fakeClock().now }), t)
  await (await ask(url, '拿鐵多少錢？')).end()
  await sink.waitFor(1, '出錯後 10 秒內沒有收到 log：catch 裡也要記一筆')
  assert.equal(sink.records.length, 1, '一個請求只記一筆')
  assert.equal(sink.records[0].status, 'error')
  assert.equal(sink.records[0].errorType, 'overloaded_error', '把 catch 到的 error 傳給 toLogRecord')
  assert.equal(sink.records[0].answer, '拿鐵', '出錯前已經送出的文字也要記')
})

test('前端斷線：中斷上游請求，記一筆 client_aborted，沒有未處理的錯誤', async t => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const events: SseItem[] = textEvents(['拿鐵', '一杯', ' 110 元。'])
  events.splice(7, 0, gate)    // 送完兩段文字後，上游停住
  const { client, requests } = fakeAnthropic([sse(events)])
  const sink = logSink()
  const url = await serve(createChatServer(client, { log: sink.log, now: fakeClock().now }), t)
  t.after(() => release())
  const before = crashes.length

  const browser = new AbortController()
  const res = await within(ask(url, '拿鐵多少錢？', browser.signal), 10_000, '10 秒內沒收到回應標頭（練習 3 要先通過）')
  await within(res.until('event: delta'), 10_000, '10 秒內沒收到第一個 delta（練習 3 要先通過）')
  browser.abort()   // 使用者關掉分頁

  await sink.waitFor(1, '前端斷線後 10 秒內沒有收到 log：上游沒有被中斷（要監聽回應的 close 事件，再 abort 傳給 SDK 的 signal），或中斷後沒有記 log')
  assert.equal(requests[0].signal?.aborted, true, '上游請求要被中斷：建立 AbortController，把 signal 傳給 client.messages.stream 的第二個參數')
  const r = sink.records[0]
  assert.equal(r.status, 'client_aborted', '中斷時 SDK 丟 APIUserAbortError，交給 toLogRecord 會記成 client_aborted')
  assert.ok(['拿鐵', '拿鐵一杯'].includes(r.answer ?? ''), `answer 是中斷前送出的文字，收到 ${JSON.stringify(r.answer)}`)
  await new Promise(resolve => setTimeout(resolve, 200))
  assert.equal(sink.records.length, 1, '一個請求只記一筆')
  assert.deepEqual(crashes.slice(before), [], '斷線後不能有未處理的錯誤（例如在 catch 裡又把 AbortError 丟出去）：伺服器的請求處理函式要自己接住')
})

test('上游正常結束時不能被誤判成斷線', async t => {
  const { client, requests } = fakeAnthropic([sse(textEvents(['好']))])
  const sink = logSink()
  const url = await serve(createChatServer(client, { log: sink.log, now: fakeClock().now }), t)
  await (await ask(url, '你好')).end()
  await sink.waitFor(1, '10 秒內沒有收到 log')
  assert.equal(sink.records[0].status, 'ok', '正常結束要是 ok：不要監聽請求的 end／close（請求本體讀完就會觸發），要聽回應的 close 並檢查 res.writableFinished')
  assert.equal(requests[0].signal?.aborted ?? false, false, '正常結束時不能 abort 上游')
})
