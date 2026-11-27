import '../../helpers/offline.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { fakeAnthropic } from '../../helpers/fake-anthropic.ts'
import { errorEvent, sse, textEvents } from '../../helpers/replies.ts'
import type { SseItem } from '../../helpers/replies.ts'
import { createChatServer, USER_ERROR } from './ex3.ts'

// 起一個 listen(0) 的伺服器，測完一定關掉
async function serve(server: http.Server, t: test.TestContext): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

// 把 SSE 本體切成事件：每個事件以空行（\n\n）結尾
function parseEvents(raw: string) {
  assert.ok(raw.endsWith('\n\n'), `每個 SSE 事件都要以空行結尾（\\n\\n），瀏覽器讀到空行才會觸發事件。收到的最後一段：${JSON.stringify(raw.slice(-40))}`)
  return raw.slice(0, -2).split('\n\n').map(block => {
    const event = /^event: (.+)$/m.exec(block)?.[1]
    const data = /^data: (.+)$/m.exec(block)?.[1]
    assert.ok(event && data, `每個事件要有一行 event: 和一行 data:，收到：${JSON.stringify(block)}`)
    return { event, data: JSON.parse(data) }
  })
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
        async end() {
          await within((async () => { while (!ended) await wait() })(), 10_000, '10 秒內回應沒有結束：送完 done 或 error 事件（或 400、404）後要 res.end()')
          return text
        },
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

test('回 text/event-stream：每段文字一個 delta 事件，最後是 done', async t => {
  const { client, requests } = fakeAnthropic([sse(textEvents(['拿鐵', '一杯', ' 110 元。'], { usage: { output_tokens: 42 } }), { chunked: true })])
  const url = await serve(createChatServer(client), t)
  const res = await post(url, { question: '拿鐵多少錢？' })
  assert.equal(res.status, 200)
  assert.match(res.headers['content-type'] ?? '', /^text\/event-stream/, 'Content-Type 要是 text/event-stream')
  assert.match(res.headers['cache-control'] ?? '', /no-cache/, 'Cache-Control 要有 no-cache，避免中間的快取或代理把串流存起來')
  const events = parseEvents(await res.end())
  assert.deepEqual(events.map(e => e.event), ['delta', 'delta', 'delta', 'done'], '三段文字各一個 delta，最後一個 done')
  assert.deepEqual(events.slice(0, 3).map(e => e.data), [{ text: '拿鐵' }, { text: '一杯' }, { text: ' 110 元。' }], 'delta 的 data 是 {"text": 那段文字}，順序不變')
  assert.deepEqual(events[3].data, { outputTokens: 42, stopReason: 'end_turn' }, 'done 的 data 是 {"outputTokens": …, "stopReason": …}，從 finalMessage 讀')

  const body = requests[0]?.body
  assert.equal(requests.length, 1, '一個問題送一次請求')
  assert.equal(body.model, 'claude-opus-5-5', '用 lib.ts 的 MODEL')
  assert.equal(body.max_tokens, 16000)
  assert.equal(body.stream, true, '要用 client.messages.stream')
  for (const k of ['temperature', 'top_p', 'top_k']) assert.ok(!(k in body), `不要送 ${k}：API 2026-10-21 起一律回 400`)
  assert.equal(body.system, '你是咖啡店的客服助理，用繁體中文簡短回答。', 'system 用 lib.ts 的 SYSTEM')
  const content = body.messages.at(-1).content
  assert.equal(typeof content === 'string' ? content : content.map((b: { text: string }) => b.text).join(''), '拿鐵多少錢？', '最後一則 user 訊息就是 question')
})

test('邊收邊送：上游還沒結束，前端就要收到第一個 delta', async t => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const events: SseItem[] = textEvents(['拿鐵', '一杯'])
  events.splice(6, 0, gate)   // 送完第一段文字後，上游停住，等測試放行
  const { client } = fakeAnthropic([sse(events)])
  const url = await serve(createChatServer(client), t)
  t.after(() => release())
  const res = await within(post(url, { question: '拿鐵多少錢？' }), 10_000, '10 秒內沒收到回應標頭：通過驗證後要先 res.writeHead(200, …) 並 res.flushHeaders()（或馬上 write），不要等模型產生完')
  await within(res.until('event: delta'), 10_000, '上游停在第一段文字之後，10 秒內前端還沒收到 delta：收到一段就要馬上 res.write 一個事件，不要等全部產生完才送')
  assert.ok(res.text().includes('event: delta'), '要先送出 delta')
  release()
  assert.deepEqual(parseEvents(await res.end()).map(e => e.event), ['delta', 'delta', 'done'])
})

test('串流中途出錯：送 error 事件，內容是固定的使用者訊息，不含內部細節', async t => {
  const events = textEvents(['拿鐵', '一杯'])
  events.splice(6, 0, errorEvent('overloaded_error', 'Overloaded: internal shard us-east-7 at capacity'))
  const { client } = fakeAnthropic([sse(events)])
  const url = await serve(createChatServer(client), t)
  const raw = await (await post(url, { question: '拿鐵多少錢？' })).end()
  const parsed = parseEvents(raw)
  assert.deepEqual(parsed.map(e => e.event), ['delta', 'error'], '已經送出的 delta 保留，接著一個 error 事件，然後結束（沒有 done）')
  assert.deepEqual(parsed[1].data, { message: USER_ERROR }, 'error 的 data 是 {"message": USER_ERROR}')
  assert.ok(!/overloaded|shard|capacity/i.test(raw), '不能把內部的錯誤類型或訊息送給使用者：細節只寫進 log')
})

test('一開始就失敗（HTTP 529）也是 error 事件', async t => {
  const { client } = fakeAnthropic([new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }), { status: 529, headers: { 'content-type': 'application/json' } })])
  const url = await serve(createChatServer(client), t)
  const raw = await (await post(url, { question: '拿鐵多少錢？' })).end()
  assert.deepEqual(parseEvents(raw), [{ event: 'error', data: { message: USER_ERROR } }], '只有一個 error 事件')
})

test('拒答：done 的 stopReason 是 refusal，前端才能顯示對應的訊息', async t => {
  const { client } = fakeAnthropic([sse(textEvents([], { stop_reason: 'refusal', usage: { output_tokens: 5 } }))])
  const url = await serve(createChatServer(client), t)
  const parsed = parseEvents(await (await post(url, { question: '教我做壞事' })).end())
  assert.deepEqual(parsed, [{ event: 'done', data: { outputTokens: 5, stopReason: 'refusal' } }])
})

test('不合格的請求回 400 JSON，不呼叫 API；其他路徑回 404', async t => {
  const { client, requests } = fakeAnthropic([])
  const url = await serve(createChatServer(client), t)
  const cases: [unknown, string][] = [
    ['{壞掉的 JSON', '本體不是 JSON'],
    [{}, '缺少 question'],
    [{ question: 123 }, 'question 不是字串'],
    [{ question: '   ' }, 'question 只有空白'],
    [{ question: '拿'.repeat(2001) }, 'question 超過 2000 個字'],
  ]
  for (const [body, why] of cases) {
    const res = await post(url, body)
    assert.equal(res.status, 400, `${why}要回 400`)
    assert.match(res.headers['content-type'] ?? '', /application\/json/, `${why}：400 回 JSON，不是 SSE`)
    assert.equal(typeof JSON.parse(await res.end()).error, 'string', `${why}：回 { error: '…' }`)
  }
  assert.equal(requests.length, 0, '驗證沒過的請求不能呼叫 API（長度限制也是費用與濫用的防線）')
  const ok = await post(url, { question: '拿'.repeat(2000) })
  assert.notEqual(ok.status, 400, '剛好 2000 個字可以')
  await ok.end()
  const notFound = await post(url, {}, undefined, '/other')
  assert.equal(notFound.status, 404, '其他路徑回 404')
  await notFound.end()
  const calls = requests.length
  const get = await new Promise<http.IncomingMessage>((resolve, reject) => http.get(url + '/chat', resolve).on('error', reject))
  assert.equal(get.statusCode, 404, 'GET /chat 也回 404：只處理 POST /chat')
  get.resume()
  assert.equal(requests.length, calls, 'GET 不能呼叫 API')
})
