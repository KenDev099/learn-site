import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { listen } from '../../helpers/http.ts'

const opts = { timeout: 15_000 }
const hex = () => Math.random().toString(16).slice(2, 10)
type Fields = Record<string, unknown>
type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

async function start(handler: Handler) {
  const mod: { accessLog?: unknown } = await import('./access-log.ts')
  assert.equal(typeof mod.accessLog, 'function', 'access-log.ts 要 export function accessLog(logger, handler)')
  const logs: { msg: string, fields?: Fields }[] = []
  const logger = { info: (msg: string, fields?: Fields) => { logs.push({ msg, fields }) } }
  const wrapped = (mod.accessLog as (l: typeof logger, h: Handler) => Handler)(logger, handler)
  const server = createServer((req, res) => {
    Promise.resolve(wrapped(req, res)).catch(err => { res.destroy(); throw err })
  })
  return { url: (await listen(server)).url, logs }
}

const ids = new Map<string, string>()
function handler(slowMs: number): Handler {
  return async (req, res) => {
    const id = hex()
    ids.set(req.url ?? '', id)
    res.setHeader('x-request-id', id)
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    if (pathname === '/slow') await sleep(slowMs)
    if (pathname === '/hang') await sleep(2000, undefined, { signal: req.signal }).catch(() => {})
    if (res.destroyed) return
    res.statusCode = pathname === '/missing' ? 404 : pathname === '/created' ? 201 : 200
    res.end('ok')
  }
}

// 等 log 出現，再多等一下，確認不會多出第二行
async function settle(logs: unknown[], n: number) {
  for (let i = 0; i < 100 && logs.length < n; i++) await sleep(10)
  await sleep(80)
}

test('正常的請求：每個請求剛好一行 { method, path（不含查詢字串）, status, durationMs, requestId }', opts, async () => {
  const { url, logs } = await start(handler(0))
  const reqs = [['GET', `/menu?size=L&r=${hex()}`, 200], ['POST', `/created?r=${hex()}`, 201], ['GET', `/missing?r=${hex()}`, 404]] as const
  for (const [method, path, status] of reqs) {
    const res = await fetch(url + path, { method })
    assert.equal(res.status, status)
    await res.text()
  }
  await settle(logs, 3)
  assert.equal(logs.length, 3, `3 個請求要剛好 3 行 access log，實際 ${logs.length} 行：finish 和 close 都記會重複`)
  reqs.forEach(([method, path, status], i) => {
    const { msg, fields = {} } = logs[i]
    assert.equal(msg, 'request', 'msg 要是 "request"')
    assert.equal(fields.method, method, 'method 要是請求的方法')
    assert.equal(fields.path, path.split('?')[0], 'path 只要路徑，不含查詢字串（查詢字串可能有個資、也讓統計分不開）')
    assert.equal(fields.status, status, `status 要是實際送出的狀態碼 ${status}：要等回應結束才記錄`)
    assert.equal(typeof fields.durationMs, 'number', 'durationMs 要是數字（毫秒）')
    assert.ok((fields.durationMs as number) >= 0)
    assert.equal(fields.requestId, ids.get(path), 'requestId 用回應標頭 x-request-id 的值（res.getHeader）')
    assert.equal(fields.aborted, undefined, '正常完成的請求不要有 aborted')
  })
})

test('慢的請求：durationMs 至少是處理的時間（用 performance.now() 從請求開始量）', opts, async () => {
  const slowMs = 80 + Math.floor(Math.random() * 60)
  const { url, logs } = await start(handler(slowMs))
  const res = await fetch(url + '/slow')
  await res.text()
  await settle(logs, 1)
  assert.equal(logs.length, 1, '一個請求剛好一行')
  const d = logs[0].fields?.durationMs as number
  assert.ok(d >= slowMs - 2 && d < slowMs + 1000, `處理花了 ${slowMs} ms，durationMs 卻是 ${d}：要在請求結束時才算耗時`)
})

test('客戶端中途離開：也要剛好一行，而且帶 aborted: true', opts, async () => {
  const { url, logs } = await start(handler(0))
  const ac = new AbortController()
  const pending = fetch(url + '/hang', { signal: ac.signal }).catch(() => 'aborted')
  await sleep(60)
  ac.abort()
  await pending
  await settle(logs, 1)
  assert.equal(logs.length, 1, `客戶端中途離開的請求要剛好一行 access log，實際 ${logs.length} 行：回應沒送完時 finish 不會觸發，要聽 close`)
  assert.equal(logs[0].fields?.aborted, true, '回應還沒送完連線就斷了，要記 aborted: true（看 res.writableFinished）')
  assert.equal(logs[0].fields?.path, '/hang')
  assert.equal(logs[0].fields?.requestId, ids.get('/hang'))
})
