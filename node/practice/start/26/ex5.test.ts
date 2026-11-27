import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { listen } from '../../helpers/http.ts'
import { assertProblem, call, opts, setupDb, startApp, waitFor } from './testkit.ts'

// 假的供應商：每個請求依序用 script 裡的一個動作回應（用完就重複最後一個）
type Step = (req: IncomingMessage, res: ServerResponse) => void
const supplier = { script: [] as Step[], calls: [] as string[], closed: 0, closedAt: 0, round: 0 }
const upstream = createServer((req, res) => {
  supplier.calls.push(req.url ?? '')
  const round = supplier.round   // 前一個測試留下的連線晚一點才關，不算在這一輪
  res.on('close', () => { if (!res.writableFinished && round === supplier.round) { supplier.closed++; supplier.closedAt = performance.now() } })
  const step = supplier.script[Math.min(supplier.calls.length - 1, supplier.script.length - 1)]
  step(req, res)
})
const { url: supplierUrl } = await listen(upstream)
const db = await setupDb()
const { url } = await startApp(db.url, { supplierUrl })

const ok = (restockAt: string): Step => (req, res) => {
  const productId = Number(req.url?.split('/').at(-1))
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ productId, restockAt }))
}
const status = (code: number, headers: Record<string, string> = {}, body = ''): Step => (_req, res) => { res.writeHead(code, headers).end(body) }
const hang: Step = () => {}
function script(...steps: Step[]) {
  supplier.script = steps
  supplier.calls = []
  supplier.closed = 0
  supplier.round++
}
const when = () => new Date(Date.UTC(2026, 10, 2 + Math.floor(Math.random() * 20), 8)).toISOString()

test('成功：回 { productId, restockAt }；我們沒有的商品回 404，不呼叫上游', opts, async () => {
  const at = when()
  script(ok(at))
  const r = await call(url + '/menu/2/restock')
  assert.equal(r.status, 200, `上游正常時要回 200，實際 ${r.status}：${r.text.slice(0, 200)}`)
  assert.deepEqual(r.json, { productId: 2, restockAt: at }, '回應是 { productId, restockAt }，restockAt 用上游給的值')
  assert.deepEqual(supplier.calls, ['/restock/2'], '要呼叫 {SUPPLIER_URL}/restock/{id}，而且只呼叫一次')
  script(ok(at))
  assertProblem(await call(url + '/menu/99999/restock'), 404, 'not-found', '商品不存在')
  assert.equal(supplier.calls.length, 0, '我們自己都沒有的商品，不用問供應商')
})

test('上游 503：最多重試 2 次', opts, async () => {
  const at = when()
  script(status(503), status(503), ok(at))
  const r = await call(url + '/menu/3/restock')
  assert.equal(r.status, 200, `兩次 503 之後第三次成功，要回 200，實際 ${r.status}`)
  assert.equal(supplier.calls.length, 3, `要呼叫 3 次（第 1 次＋重試 2 次），實際 ${supplier.calls.length}`)
  script(status(503))
  const bad = await call(url + '/menu/3/restock')
  assertProblem(bad, 503, 'upstream-unavailable', '上游一直 503')
  assert.equal(supplier.calls.length, 3, `重試最多 2 次（總共 3 次），實際 ${supplier.calls.length} 次`)
})

test('404、500 不重試；回 503 problem，不含上游的細節', opts, async () => {
  script(status(404))
  assertProblem(await call(url + '/menu/4/restock'), 503, 'upstream-unavailable', '上游 404')
  assert.equal(supplier.calls.length, 1, '404 不是暫時性的錯誤，不能重試')
  const secret = `supplier-db-${randomBytes(4).toString('hex')}`
  script(status(500, { 'content-type': 'text/plain' }, `Internal error: connect ${secret}:5432 password=hunter2`))
  const r = await call(url + '/menu/4/restock')
  assertProblem(r, 503, 'upstream-unavailable', '上游 500')
  assert.equal(supplier.calls.length, 1, '只有 503 才重試')
  assert.ok(!r.text.includes(secret) && !r.text.includes('hunter2'), '回應裡出現了上游的錯誤內容：上游的細節只進 log，回給客戶端的 detail 要自己寫')
})

test('Retry-After：照著等；要等太久就不等了', opts, async () => {
  const at = when()
  script(status(503, { 'retry-after': '1' }), ok(at))
  const r = await call(url + '/menu/5/restock')
  assert.equal(r.status, 200, '等 1 秒重試後要成功')
  assert.ok(r.ms >= 950, `上游說 Retry-After: 1，要等 1 秒再試，實際 ${Math.round(r.ms)}ms 就完成了`)
  script(status(503, { 'retry-after': '120' }), ok(at))
  const long = await call(url + '/menu/5/restock')
  assertProblem(long, 503, 'upstream-unavailable', '上游要我們等 120 秒')
  assert.ok(long.ms < 800, `Retry-After 超過 2 秒就直接回 503，不要讓客戶端等，實際 ${Math.round(long.ms)}ms`)
  assert.equal(supplier.calls.length, 1, 'Retry-After 太長時不重試')
})

test('上游沒回應：1 秒逾時，回 503', opts, async () => {
  script(hang)
  const r = await call(url + '/menu/6/restock', { timeoutMs: 4000 })
  assertProblem(r, 503, 'upstream-unavailable', '上游卡住')
  assert.ok(r.ms >= 900 && r.ms < 2000, `每次呼叫上游最多等 1 秒（逾時不重試），實際 ${Math.round(r.ms)}ms`)
})

test('客戶端離開：取消還在進行的上游請求', opts, async () => {
  script(hang)
  const ac = new AbortController()
  const pending = fetch(url + '/menu/2/restock', { signal: ac.signal }).catch(() => 'aborted')
  assert.ok(await waitFor(() => supplier.calls.length === 1, 1000), '要呼叫上游')
  await sleep(100)
  const abortedAt = performance.now()
  ac.abort()
  await pending
  await waitFor(() => supplier.closed === 1, 1500)
  const ms = supplier.closedAt - abortedAt
  assert.ok(supplier.closed === 1 && ms < 400, `客戶端離開後 ${supplier.closed ? Math.round(ms) + 'ms' : '一直'}才關掉上游的請求：把 res 的 close 接到 AbortController，馬上取消 fetch，不要等逾時`)
})
