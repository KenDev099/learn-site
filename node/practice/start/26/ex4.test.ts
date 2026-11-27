import test from 'node:test'
import assert from 'node:assert/strict'
import { assertProblem, call, opts, patchJson, setupDb, startApp, waitFor } from './testkit.ts'

const db = await setupDb()
const { app, url } = await startApp(db.url)
const newOrder = async () => (await db.pool.query<{ id: number }>('INSERT INTO orders (customer_id, ordered_at, total) VALUES (1, now(), 80) RETURNING id')).rows[0].id
const statusOf = async (id: number) => (await db.pool.query<{ status: string }>('SELECT status FROM orders WHERE id = $1', [id])).rows[0].status

// 開一條 SSE 連線，收到的事件放進 events；done 在串流結束時 resolve
function subscribe(id: number) {
  const ac = new AbortController()
  const events: { event: string, data: any }[] = []
  let headers: Headers | undefined
  const done = (async () => {
    const res = await fetch(`${url}/orders/${id}/events`, { signal: ac.signal })
    headers = res.headers
    if (!res.body) return
    let buf = ''
    const dec = new TextDecoder()
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true })
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i)
        buf = buf.slice(i + 2)
        const ev = { event: 'message', data: '' }
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) ev.event = line.slice(6).trim()
          if (line.startsWith('data:')) ev.data += line.slice(5).trim()
        }
        if (ev.data) events.push({ event: ev.event, data: JSON.parse(ev.data) })
      }
    }
  })().then(() => 'ended', err => (err as Error).name)
  return { events, done, abort: () => ac.abort(), headers: () => headers }
}

test('PATCH /orders/:id：照狀態機轉換，不合法回 409', opts, async () => {
  const id = await newOrder()
  assertProblem(await patchJson(`${url}/orders/${id}`, { status: 'ready' }), 409, 'invalid-transition', 'pending 直接改 ready')
  assert.equal(await statusOf(id), 'pending', '不合法的轉換不能改到資料庫')
  for (const status of ['brewing', 'ready', 'picked_up']) {
    const r = await patchJson(`${url}/orders/${id}`, { status })
    assert.equal(r.status, 200, `改成 ${status} 要回 200，實際 ${r.status}：${r.text.slice(0, 200)}`)
    assert.deepEqual(r.json, { id, status }, '回應是 { id, status }')
    assert.equal(await statusOf(id), status, `資料庫裡的狀態要變成 ${status}`)
  }
  assertProblem(await patchJson(`${url}/orders/${id}`, { status: 'pending' }), 409, 'invalid-transition', 'picked_up 改回 pending')
  const other = await newOrder()
  assert.equal((await patchJson(`${url}/orders/${other}`, { status: 'cancelled' })).status, 200, 'pending 可以改成 cancelled')
  assertProblem(await patchJson(`${url}/orders/${other}`, { status: 'brewing' }), 409, 'invalid-transition', 'cancelled 改成 brewing')
  assertProblem(await patchJson(`${url}/orders/${id}`, { status: 'done' }), 400, 'validation', '不認得的狀態')
  assertProblem(await patchJson(`${url}/orders/999999`, { status: 'brewing' }), 404, 'not-found', '訂單不存在')
})

test('兩個店員同時改同一張訂單：只有一個成功', opts, async () => {
  const ids = await Promise.all(Array.from({ length: 8 }, newOrder))
  const results = await Promise.all(ids.flatMap(id => [
    patchJson(`${url}/orders/${id}`, { status: 'brewing' }),
    patchJson(`${url}/orders/${id}`, { status: 'cancelled' }),
  ]))
  for (let i = 0; i < ids.length; i++) {
    const pair = [results[2 * i].status, results[2 * i + 1].status].sort()
    assert.deepEqual(pair, [200, 409], `訂單 ${ids[i]} 同時被改成 brewing 和 cancelled，結果是 ${JSON.stringify(pair)}：先 SELECT 再 UPDATE 會兩個都成功。把檢查放進 UPDATE 的 WHERE（status = ANY(可轉換的來源狀態)）`)
  }
})

test('GET /orders/:id/events：SSE 先送目前狀態，再推送每次變化，取餐後結束', opts, async () => {
  const id = await newOrder()
  const other = await newOrder()
  const sub = subscribe(id)
  const subOther = subscribe(other)
  assert.ok(await waitFor(() => sub.events.length >= 1 && subOther.events.length >= 1), '連上之後要先送一則目前的狀態')
  assert.match(sub.headers()?.get('content-type') ?? '', /^text\/event-stream/, 'Content-Type 要是 text/event-stream')
  assert.deepEqual(sub.events[0], { event: 'status', data: { orderId: id, status: 'pending' } }, '事件格式：event: status，data: {"orderId":…,"status":…}')
  // 別張訂單被取消：它的串流要結束，這張訂單的串流不能收到
  await patchJson(`${url}/orders/${other}`, { status: 'cancelled' })
  assert.equal(await Promise.race([subOther.done, new Promise(r => setTimeout(r, 2000, 'timeout'))]), 'ended', 'cancelled 之後狀態也不會再變，要結束串流')
  for (const status of ['brewing', 'ready', 'picked_up']) await patchJson(`${url}/orders/${id}`, { status })
  assert.equal(await Promise.race([sub.done, new Promise(r => setTimeout(r, 2000, 'timeout'))]), 'ended', 'picked_up 之後狀態不會再變，要結束串流（res.end()）')
  assert.deepEqual(sub.events.map(e => e.data.orderId + ':' + e.data.status), ['pending', 'brewing', 'ready', 'picked_up'].map(s => id + ':' + s),
    '這張訂單的每次狀態變化都要推送一則事件，而且只送這張訂單的：orderEvents 上是所有訂單的事件，要比對 orderId')
  assertProblem(await call(`${url}/orders/999999/events`), 404, 'not-found', '訂單不存在時')
})

test('客戶端離開後監聽器要拿掉；startShutdown() 會結束所有 SSE 串流', opts, async () => {
  const events = app.orderEvents
  assert.ok(events, 'createApp 要回傳 orderEvents（EventEmitter）')
  const base = events!.listenerCount('status')
  const id = await newOrder()
  const subs = [subscribe(id), subscribe(id), subscribe(id)]
  assert.ok(await waitFor(() => subs.every(s => s.events.length >= 1)), '三條 SSE 連線都要收到第一則事件')
  assert.equal(events!.listenerCount('status'), base + 3, '每條 SSE 連線在 orderEvents 上掛一個 status 監聽器')
  for (const s of subs) s.abort()
  assert.ok(await waitFor(() => events!.listenerCount('status') === base && events!.listenerCount('shutdown') === 0),
    `客戶端離開後監聽器還在（status ${events!.listenerCount('status') - base}、shutdown ${events!.listenerCount('shutdown')}）：在 res.on('close') 裡 off() 掉，不然每條斷掉的連線都留一個`)

  const live = subscribe(await newOrder())
  assert.ok(await waitFor(() => live.events.length >= 1))
  app.startShutdown()
  assert.equal(await Promise.race([live.done, new Promise(r => setTimeout(r, 1500, 'timeout'))]), 'ended', 'startShutdown() 之後 SSE 串流要結束：SSE 不會自己結束，不關掉會卡住優雅關機')
})
