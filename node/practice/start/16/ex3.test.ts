import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { get, type IncomingMessage, type Server } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { listen } from '../../helpers/http.ts'

const opts = { timeout: 15_000 }
const rand = (n: number) => Math.floor(Math.random() * n)
type SseEvent = { id?: string, event?: string, data?: string }

async function start() {
  const mod: { createSseApp?: unknown } = await import('./sse-app.ts')
  assert.equal(typeof mod.createSseApp, 'function', 'sse-app.ts 要 export function createSseApp(orderEvents, { heartbeatMs })')
  const orderEvents = new EventEmitter()
  const server = (mod.createSseApp as (e: EventEmitter, o: { heartbeatMs: number }) => Server)(orderEvents, { heartbeatMs: 50 })
  return { orderEvents, url: (await listen(server)).url }
}

// SSE 客戶端：收到的文字依「空行」切成一個個事件；每一行完整的註解（: 開頭）算一次心跳
function connect(url: string) {
  const state = { text: '', events: [] as SseEvent[], heartbeats: 0, ended: false }
  const parse = () => {
    const blocks = state.text.split('\n\n')
    state.events = []
    state.heartbeats = state.text.match(/^:.*\n/gm)?.length ?? 0
    for (const block of blocks.slice(0, -1)) {
      const lines = block.split('\n').filter(Boolean)
      if (lines.every(l => l.startsWith(':'))) continue
      const ev: SseEvent = {}
      for (const line of lines) {
        if (line.startsWith(':')) continue
        const i = line.indexOf(':')
        const key = line.slice(0, i), value = line.slice(i + 1).replace(/^ /, '')
        if (key === 'id' || key === 'event') ev[key] = value
        if (key === 'data') ev.data = ev.data === undefined ? value : ev.data + '\n' + value
      }
      state.events.push(ev)
    }
  }
  const req = get(url, { agent: false, headers: { accept: 'text/event-stream' } }, res => {
    res.setEncoding('utf8')
    res.on('data', (s: string) => { state.text += s; parse() })
    res.on('end', () => { state.ended = true })
    res.on('error', () => {})
  })
  const ready = new Promise<IncomingMessage>((resolve, reject) => {
    req.on('response', resolve)
    req.on('error', reject)
  })
  return { state, ready, close: () => req.destroy() }
}

async function waitFor(check: () => boolean, ms: number) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(10)) if (check()) return true
  return check()
}

// 學習者的程式如果沒清掉心跳計時器，這個測試檔的程序會一直結束不了；測試跑完 1 秒後強制結束（結束碼照測試結果）
after(() => { setTimeout(() => process.exit(), 1000).unref() })

const timers = () => process.getActiveResourcesInfo().filter(r => r === 'Timeout').length

test('回應是 text/event-stream，而且有心跳', opts, async () => {
  const { url } = await start()
  const c = connect(`${url}/orders/${1 + rand(999)}/events`)
  const res = await c.ready
  assert.equal(res.statusCode, 200)
  assert.match(String(res.headers['content-type']), /^text\/event-stream/, 'Content-Type 要是 text/event-stream')
  assert.match(String(res.headers['cache-control']), /no-cache/, 'Cache-Control 要是 no-cache')
  assert.ok(await waitFor(() => c.state.heartbeats >= 2, 1000), `heartbeatMs 是 50，1 秒內卻沒收到至少兩次心跳：用 setInterval 定時送一行冒號開頭的註解（例如 ": heartbeat\\n\\n"）。目前收到：${JSON.stringify(c.state.text.slice(0, 120))}`)
  c.close()
})

test('只推送這張訂單的事件，格式是 id／event／data，picked_up 後結束串流', opts, async () => {
  const { url, orderEvents } = await start()
  const orderId = 100 + rand(900)
  const c = connect(`${url}/orders/${orderId}/events`)
  await c.ready
  assert.ok(await waitFor(() => orderEvents.listenerCount('status') === 1, 1000), '連線後要在 orderEvents 上監聽 status 事件')
  orderEvents.emit('status', { orderId: orderId + 1, status: 'brewing' })
  orderEvents.emit('status', { orderId, status: 'brewing' })
  assert.ok(await waitFor(() => c.state.events.length >= 1, 1000), `送出一個狀態後，客戶端解析不到事件：每個事件最後要有一個空行（\\n\\n）。目前收到：${JSON.stringify(c.state.text.slice(0, 160))}`)
  await sleep(50)
  assert.equal(c.state.ended, false, '送出 brewing 之後串流就結束了：只有狀態變成 picked_up 時才 res.end()')
  // 第二個客戶端晚一點才連上同一張訂單：它的 id 也要從 1 開始
  const late = connect(`${url}/orders/${orderId}/events`)
  await late.ready
  assert.ok(await waitFor(() => orderEvents.listenerCount('status') === 2, 1000), '第二個客戶端連線後，orderEvents 上要有 2 個 status 監聽器')
  orderEvents.emit('status', { orderId, status: 'ready' })
  orderEvents.emit('status', { orderId, status: 'picked_up' })
  assert.ok(await waitFor(() => c.state.ended, 1000), `picked_up 送出之後要結束串流（res.end()），客戶端才知道不會再有事件。目前收到 ${c.state.events.length} 個事件`)
  const got = c.state.events
  assert.equal(got.length, 3, `要收到 3 個事件（brewing、ready、picked_up），其他訂單的事件不能送。實際收到：${JSON.stringify(got)}。每個事件最後要有一個空行（\\n\\n），少了空行，客戶端會把幾個事件黏在一起或收不到`)
  assert.deepEqual(got.map(e => e.event), ['status', 'status', 'status'], '每個事件要有 event: status')
  assert.deepEqual(got.map(e => e.id), ['1', '2', '3'], '每個事件要有 id，從 1 開始遞增；瀏覽器重連時會用 Last-Event-ID 帶回最後一個 id')
  assert.deepEqual(got.map(e => JSON.parse(e.data ?? 'null')), ['brewing', 'ready', 'picked_up'].map(status => ({ orderId, status })), 'data 要是事件物件的 JSON')
  assert.ok(await waitFor(() => late.state.ended, 1000), 'picked_up 之後，每一條連線都要結束')
  assert.deepEqual(late.state.events.map(e => [e.id, JSON.parse(e.data ?? 'null')?.status]), [['1', 'ready'], ['2', 'picked_up']], `晚連上的客戶端收到 ${JSON.stringify(late.state.events)}：序號要每條連線各自從 1 開始（計數器放在處理請求的函式裡，不是整個模組或整個 app 共用一個）`)
  assert.ok(await waitFor(() => orderEvents.listenerCount('status') === 0, 500), '串流結束後要移除 orderEvents 上的監聽器')
})

test('客戶端離開：監聽器和心跳計時器都要清掉（50 個客戶端）', opts, async () => {
  const { url, orderEvents } = await start()
  await sleep(50)
  const before = timers()
  const clients = Array.from({ length: 50 }, (_, i) => connect(`${url}/orders/${1000 + i}/events`))
  await Promise.all(clients.map(c => c.ready))
  assert.ok(await waitFor(() => orderEvents.listenerCount('status') === 50, 2000), `50 個客戶端連線後，orderEvents 上要有 50 個 status 監聽器，實際是 ${orderEvents.listenerCount('status')}`)
  for (const c of clients) c.close()
  const cleaned = await waitFor(() => orderEvents.listenerCount('status') === 0, 200)
  assert.ok(cleaned, `客戶端離開 200ms 後，orderEvents 上還有 ${orderEvents.listenerCount('status')} 個監聽器：這就是第 8 課的監聽器洩漏。在 res 的 'close' 事件裡用 orderEvents.off 移除`)
  await sleep(100)
  assert.ok(timers() <= before, `客戶端都離開了，還有 ${timers() - before} 個計時器在跑：在 res 的 'close' 事件裡 clearInterval 心跳`)
})
