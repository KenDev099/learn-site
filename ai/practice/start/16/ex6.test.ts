import '../../helpers/offline.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { request, type Server } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { fakeClock } from '../../helpers/clock.ts'
import { TenantLimiter, ZERO_USAGE } from './kit.ts'
import type { Session } from './kit.ts'
import type { Reply } from './ex3.ts'
import { createChatServer, ERROR_TEXT, FALLBACK_TEXT, MAX_QUESTION_CHARS } from './ex6.ts'

// 用 node:http 送請求（測試把全域 fetch 關掉了）
type Res = { status: number; headers: Record<string, string | string[] | undefined>; body: string }
function post(server: Server, body: unknown, headers: Record<string, string> = {}, path = '/chat'): Promise<Res> {
  const { port } = server.address() as AddressInfo
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, res => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', c => { data += c })
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: data }))
    })
    req.on('error', reject)
    req.end(typeof body === 'string' ? body : JSON.stringify(body))
  })
}
// 解析 SSE：每個事件以空行結尾
function events(body: string) {
  assert.ok(body.endsWith('\n\n'), `每個 SSE 事件都要以空行（\\n\\n）結尾，瀏覽器才會觸發；你送出的是：${JSON.stringify(body.slice(-40))}`)
  return body.trim().split('\n\n').map(block => {
    const event = block.match(/^event: (.+)$/m)?.[1]
    const data = block.match(/^data: (.+)$/m)?.[1]
    return { event, data: data ? JSON.parse(data) : undefined }
  })
}

async function start(opts: { reply?: (s: Session, q: string) => Reply | Promise<Reply>; enabled?: boolean; rate?: number } = {}) {
  const clock = fakeClock(0)
  const made: Session[] = []
  const asked: string[] = []
  const reply = opts.reply ?? ((_s: Session, q: string): Reply => ({ status: 'answered', answer: `回答：${q}`, sources: ['menu'], usage: ZERO_USAGE, turns: 1 }))
  const server = createChatServer({
    makeAssistant: session => { made.push(session); return { ask: async q => { asked.push(q); return reply(session, q) } } },
    limiter: new TenantLimiter({ ratePerMin: opts.rate ?? 5, now: clock.now }),
    enabled: () => opts.enabled ?? true,
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { server, clock, made, asked, close: () => new Promise(r => server.close(r)) }
}
const ME = { 'x-customer-id': '1' }

test('正常的問題：status → delta → done，done 帶 sources', async () => {
  const t = await start()
  try {
    const res = await post(t.server, { question: '拿鐵多少錢？' }, ME)
    assert.equal(res.status, 200)
    assert.match(String(res.headers['content-type']), /^text\/event-stream/, 'Content-Type 要是 text/event-stream')
    assert.equal(res.headers['cache-control'], 'no-cache', 'Cache-Control 要是 no-cache，代理伺服器才不會把串流整段暫存')
    const ev = events(res.body)
    assert.deepEqual(ev.map(e => e.event), ['status', 'delta', 'done'], '事件順序：status（讓前端先顯示「查詢中」）→ delta（回答）→ done')
    assert.deepEqual(ev[1].data, { text: '回答：拿鐵多少錢？' })
    assert.deepEqual(ev[2].data, { status: 'answered', sources: ['menu'] }, 'done 要帶 status 與 sources，前端用 sources 顯示引用來源')
    assert.deepEqual(t.made, [{ customerId: 1 }], 'makeAssistant 收到的 session 是 header 的顧客 id（數字）')
  } finally { await t.close() }
})

test('沒有登入：401，不建立助理', async () => {
  const t = await start()
  try {
    const cases: Record<string, string>[] = [{}, { 'x-customer-id': 'abc' }, { 'x-customer-id': '0' }, { 'x-customer-id': '1 OR 1=1' }]
    for (const headers of cases) {
      const res = await post(t.server, { question: '拿鐵多少錢？', customerId: 2 }, headers)
      assert.equal(res.status, 401, `header ${JSON.stringify(headers)} 要回 401（x-customer-id 要是正整數）`)
      assert.ok(JSON.parse(res.body).error, '錯誤回應是 JSON：{ error: … }')
    }
    assert.equal(t.made.length, 0)
  } finally { await t.close() }
})

test('身分只看 header，不看 body', async () => {
  const t = await start()
  try {
    await post(t.server, { question: '我的訂單呢', customerId: 2 }, ME)
    assert.deepEqual(t.made, [{ customerId: 1 }], 'body 的 customerId 是顧客自己填的，可以偽造：身分只能來自登入資訊（這裡是 header）')
  } finally { await t.close() }
})

test('每位顧客每分鐘 5 次：第 6 次 429，其他顧客不受影響，過一陣子會補回來', async () => {
  const t = await start()
  try {
    for (let i = 0; i < 5; i++) assert.equal((await post(t.server, { question: `第 ${i + 1} 題` }, ME)).status, 200)
    const sixth = await post(t.server, { question: '第 6 題' }, ME)
    assert.equal(sixth.status, 429, '第 6 次要回 429：先用 limiter.take(String(customerId)) 檢查')
    assert.ok(JSON.parse(sixth.body).error)
    assert.equal(t.asked.length, 5, '被限流的請求不能呼叫模型')
    assert.equal((await post(t.server, { question: '別人的第 1 題' }, { 'x-customer-id': '2' })).status, 200, '限流是每位顧客分開算的')
    t.clock.advance(12_000)
    assert.equal((await post(t.server, { question: '12 秒後' }, ME)).status, 200, '每分鐘 5 個，12 秒補回 1 個')
  } finally { await t.close() }
})

test('question 沒填、不是字串、太長、JSON 壞掉：400', async () => {
  const t = await start({ rate: 100 })
  try {
    for (const body of [{}, { question: '' }, { question: 42 }, { question: '咖'.repeat(MAX_QUESTION_CHARS + 1) }, '{壞掉的 JSON']) {
      const res = await post(t.server, body, ME)
      assert.equal(res.status, 400, `body ${JSON.stringify(body).slice(0, 30)} 要回 400`)
    }
    assert.equal((await post(t.server, { question: '咖'.repeat(MAX_QUESTION_CHARS) }, ME)).status, 200, `剛好 ${MAX_QUESTION_CHARS} 字可以`)
  } finally { await t.close() }
})

test('功能旗標關閉：不建立助理，回固定訊息', async () => {
  const t = await start({ enabled: false })
  try {
    const ev = events((await post(t.server, { question: '拿鐵多少錢？' }, ME)).body)
    assert.deepEqual(ev, [{ event: 'delta', data: { text: FALLBACK_TEXT } }, { event: 'done', data: { status: 'disabled', sources: [] } }])
    assert.equal(t.made.length, 0, 'enabled() 是 false 時完全不碰模型（供應商出事時的回退方式）')
  } finally { await t.close() }
})

test('助理出錯：送 error 事件，不洩漏內部訊息', async () => {
  const t = await start({ reply: () => { throw new Error('529 overloaded_error: Overloaded (request-id req_123)') } })
  try {
    const res = await post(t.server, { question: '拿鐵多少錢？' }, ME)
    const ev = events(res.body)
    assert.deepEqual(ev.at(-1), { event: 'error', data: { message: ERROR_TEXT } }, '最後一個事件是 error，訊息用固定的 ERROR_TEXT')
    assert.doesNotMatch(res.body, /overloaded|req_123/, '內部錯誤訊息只寫進 log，不送給前端')
  } finally { await t.close() }
})

test('其他路徑：404', async () => {
  const t = await start()
  try {
    assert.equal((await post(t.server, { question: 'x' }, ME, '/admin')).status, 404)
  } finally { await t.close() }
})
