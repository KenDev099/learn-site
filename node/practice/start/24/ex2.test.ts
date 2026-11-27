import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import { request } from 'node:http'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import pg from 'pg'
import { COFFEE_SQL, createTestDb } from '../../helpers/db.ts'
import { call, startWorkers } from './test-cluster.ts'

const opts = { timeout: 60_000 }
const { url, pool: db, name } = await createTestDb([COFFEE_SQL, join(import.meta.dirname, 'schema.sql')])

type Bus = { close: () => Promise<void> }
type Mod = { updateStatus?: unknown, startEventsBus?: unknown }
async function load() {
  const mod: Mod = await import('./events-bus.ts')
  assert.equal(typeof mod.updateStatus, 'function', 'events-bus.ts 要 export updateStatus(pool, orderId, status)')
  assert.equal(typeof mod.startEventsBus, 'function', 'events-bus.ts 要 export startEventsBus({ url, orderEvents })')
  return mod as {
    updateStatus: (pool: pg.Pool, orderId: number, status: string) => Promise<boolean>
    startEventsBus: (o: { url: string, orderEvents: EventEmitter }) => Promise<Bus>
  }
}

async function newOrder() {
  const { rows } = await db.query<{ id: number }>("INSERT INTO orders (customer_id, ordered_at, total) VALUES ($1, now(), 110) RETURNING id", [1 + Math.floor(Math.random() * 6)])
  return rows[0].id
}
const listeners = async () => (await db.query<{ n: number }>(
  "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND query ILIKE 'LISTEN%' AND pid <> pg_backend_pid()", [name])).rows[0].n

async function waitFor(check: () => boolean | Promise<boolean>, ms: number) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(10)) if (await check()) return true
  return check()
}

// 測試自己的監聽者：記下 order_status 頻道收到的每一則 payload
async function spy() {
  const client = new pg.Client({ connectionString: url })
  client.on('error', () => {})
  const got: string[] = []
  client.on('notification', m => { if (m.channel === 'order_status') got.push(m.payload ?? '') })
  await client.connect()
  await client.query('LISTEN order_status')
  return { got, close: () => client.end() }
}

test('startEventsBus：用一條專用連線 LISTEN，收到的通知轉給 orderEvents，close() 釋放連線', opts, async () => {
  const { startEventsBus } = await load()
  const orderEvents = new EventEmitter()
  const got: unknown[] = []
  orderEvents.on('status', e => got.push(e))
  const base = await listeners()
  const bus = await startEventsBus({ url, orderEvents })
  assert.equal(await listeners() - base, 1, '啟動後資料庫裡要有一條執行過 LISTEN 的連線：用 new pg.Client 連線後 LISTEN order_status')
  const event = { orderId: 1000 + Math.floor(Math.random() * 9000), status: 'ready' }
  await db.query('SELECT pg_notify($1, $2)', ['order_status', JSON.stringify(event)])
  assert.ok(await waitFor(() => got.length > 0, 1000), "別的連線送出 NOTIFY 後 1 秒內，orderEvents 沒有收到 'status' 事件：在那條專用連線上監聽 'notification'。用 pool.query('LISTEN …') 時，LISTEN 跑在一條借了又還回去的連線上，沒有人接它的通知")
  assert.deepEqual(got[0], event, 'orderEvents 收到的要是 JSON.parse(payload) 之後的事件物件')
  await bus.close()
  assert.ok(await waitFor(async () => await listeners() === base, 1000), 'close() 之後 LISTEN 的連線要關掉（client.end()），程序才能正常結束')
})

test('updateStatus：UPDATE 與 NOTIFY 在同一個交易，失敗或找不到訂單時不通知', opts, async () => {
  const { updateStatus } = await load()
  const s = await spy()
  const pool = new pg.Pool({ connectionString: url, max: 3 })
  const id = await newOrder()
  assert.equal(await updateStatus(pool, id, 'brewing'), true, '更新成功要回傳 true')
  assert.equal((await db.query('SELECT status FROM orders WHERE id = $1', [id])).rows[0].status, 'brewing', '要真的更新 orders.status')
  assert.ok(await waitFor(() => s.got.length === 1, 1000), `更新後要在 order_status 頻道 NOTIFY 一次，收到 ${s.got.length} 次`)
  assert.deepEqual(JSON.parse(s.got[0]), { orderId: id, status: 'brewing' }, 'payload 只放 JSON：{ orderId, status }')

  const err = await updateStatus(pool, id, 'cancelled').then(() => null, (e: { code?: string }) => e)
  assert.equal(err?.code, '23514', '不認得的狀態違反 CHECK 約束（23514），要把錯誤丟出去')
  assert.equal(await updateStatus(pool, 999_999, 'ready'), false, '訂單不存在要回傳 false')
  await sleep(300)
  assert.deepEqual(s.got.map(p => JSON.parse(p).status), ['brewing'], `ROLLBACK 的更新、不存在的訂單都不能發出通知，實際收到 ${JSON.stringify(s.got)}：NOTIFY 要放在 UPDATE 成功之後、同一個交易裡（COMMIT 才送出）`)
  assert.equal(pool.idleCount, pool.totalCount, '借出的連線都要還回去')
  await pool.end()
  await s.close()
})

// SSE 客戶端：收集 data 欄位
function sse(url: string) {
  const events: { orderId: number, status: string }[] = []
  let pid = 0
  const req = request(url, { agent: false, headers: { accept: 'text/event-stream' } }, res => {
    pid = Number(res.headers['x-pid'])
    let buf = ''
    res.setEncoding('utf8').on('data', (s: string) => {
      buf += s
      const blocks = buf.split('\n\n')
      buf = blocks.pop() ?? ''
      for (const b of blocks) for (const line of b.split('\n')) if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)))
    }).on('error', () => {})
  })
  req.on('error', () => {})
  req.end()
  return { events, pid: () => pid, ready: once(req, 'response'), close: () => req.destroy() }
}

test('2 個 worker：PATCH 落在哪個程序，連在另一個程序的 SSE 都在 2 秒內收到', opts, async () => {
  const app = await startWorkers(2, url)
  const id = await newOrder()
  const client = sse(`${app.url}/orders/${id}/events`)
  await client.ready
  await sleep(100)
  const statuses = ['brewing', 'ready', 'brewing', 'ready', 'brewing', 'ready']
  const pids: number[] = []
  for (const [i, status] of statuses.entries()) {
    const r = await call(app.url, 'PATCH', `/orders/${id}/status`, { status })
    assert.equal(r.status, 200, `PATCH 要回 200，收到 ${r.status}：${JSON.stringify(r.body)}`)
    pids.push(r.pid)
    const ok = await waitFor(() => client.events.length >= i + 1, 2_000)
    const where = r.pid === client.pid() ? '同一個程序' : '另一個程序'
    assert.ok(ok, `第 ${i + 1} 次 PATCH（${status}）落在${where}，SSE 客戶端 2 秒內沒收到事件：事件要經過 PostgreSQL 的 NOTIFY，每個程序 LISTEN 後轉給自己的 orderEvents`)
    assert.deepEqual(client.events[i], { orderId: id, status }, `SSE 收到的第 ${i + 1} 個事件要是這次的更新，實際收到 ${JSON.stringify(client.events)}：每次更新只能送出一次事件`)
  }
  await sleep(300)
  assert.equal(client.events.length, statuses.length, `更新了 ${statuses.length} 次，SSE 卻收到 ${client.events.length} 個事件：每次更新只能收到一次（只靠 NOTIFY，不要再從程序內的 EventEmitter 多送一次）`)
  assert.ok(pids.some(p => p !== client.pid()), '（測試環境）應該有 PATCH 落在另一個 worker')
  client.close()
  await app.stop()
})
