import test from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { listen } from '../../helpers/http.ts'

const opts = { timeout: 15_000 }
type App = { server: Server, startShutdown: () => void }

// checkDb 的三種狀況：成功、失敗、卡住（永遠不回應）；calls 記錄被呼叫幾次
function fakeDb(mode: 'ok' | 'fail' | 'hang') {
  const db = {
    calls: 0,
    mode,
    checkDb: () => {
      db.calls++
      if (db.mode === 'ok') return Promise.resolve()
      if (db.mode === 'fail') return Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:54329'))
      return new Promise<void>(() => {})
    },
  }
  return db
}

async function start(db: ReturnType<typeof fakeDb>) {
  const mod: { createApp?: unknown } = await import('./app.ts')
  assert.equal(typeof mod.createApp, 'function', 'app.ts 要 export function createApp({ checkDb })')
  const app = (mod.createApp as (d: { checkDb: () => Promise<void> }) => App)({ checkDb: db.checkDb })
  assert.equal(typeof app?.startShutdown, 'function', 'createApp 要回傳 { server, startShutdown }')
  const { url } = await listen(app.server)
  return { app, url }
}

async function get(base: string, path: string) {
  const t0 = performance.now()
  let res: Response
  try {
    res = await fetch(base + path, { signal: AbortSignal.timeout(2500) })
  } catch (err) {
    assert.fail(`GET ${path} 在 2.5 秒內沒有回應（${(err as Error).name}）：checkDb 卡住時不能一直等，超過 500ms 就當成失敗`)
  }
  const text = await res.text()
  let json: any
  try { json = JSON.parse(text) } catch { assert.fail(`GET ${path} 的回應不是 JSON：${text.slice(0, 100)}`) }
  return { status: res.status, json, ms: performance.now() - t0 }
}

test('GET /healthz 永遠回 200 { status: "ok" }，而且不呼叫 checkDb', opts, async () => {
  for (const mode of ['ok', 'fail', 'hang'] as const) {
    const db = fakeDb(mode)
    const { url } = await start(db)
    const r = await get(url, '/healthz')
    assert.equal(r.status, 200, `資料庫狀態是 ${mode} 時 /healthz 也要回 200：liveness 只看程序能不能回應，不檢查依賴`)
    assert.deepEqual(r.json, { status: 'ok' }, '/healthz 的 body 是 { status: "ok" }')
    assert.equal(db.calls, 0, '/healthz 不能呼叫 checkDb：資料庫一晃，所有實例都會被當成死掉而重啟')
  }
})

test('GET /readyz：checkDb 成功回 200，失敗回 503 並說明原因', opts, async () => {
  const db = fakeDb('ok')
  const { url } = await start(db)
  const ok = await get(url, '/readyz')
  assert.equal(ok.status, 200, 'checkDb 成功時 /readyz 要回 200')
  assert.ok(db.calls >= 1, '/readyz 要呼叫 checkDb 檢查資料庫')
  db.mode = 'fail'
  const bad = await get(url, '/readyz')
  assert.equal(bad.status, 503, 'checkDb 失敗時 /readyz 要回 503：每次請求都要重新檢查')
  assert.equal(typeof bad.json?.reason, 'string', '503 的 body 要有 reason 說明原因')
  assert.ok(bad.json.reason.length > 0, 'reason 不能是空字串')
  db.mode = 'ok'
  assert.equal((await get(url, '/readyz')).status, 200, '資料庫恢復後 /readyz 要回到 200')
})

test('GET /readyz：checkDb 卡住時，約 500ms 後回 503', opts, async () => {
  const db = fakeDb('hang')
  const { url } = await start(db)
  const r = await get(url, '/readyz')
  assert.equal(r.status, 503, 'checkDb 卡住超過 500ms 要回 503')
  assert.ok(r.ms >= 400, `回得太快（${Math.round(r.ms)}ms）：要等 checkDb 最多 500ms，不是直接判失敗`)
  assert.equal(typeof r.json?.reason, 'string', '503 的 body 要有 reason')
})

test('startShutdown() 之後 /readyz 回 503，/healthz 仍是 200', opts, async () => {
  const db = fakeDb('ok')
  const { app, url } = await start(db)
  assert.equal((await get(url, '/readyz')).status, 200, '關機前 /readyz 要回 200')
  app.startShutdown()
  const r = await get(url, '/readyz')
  assert.equal(r.status, 503, 'startShutdown() 之後 /readyz 要回 503，負載平衡器才會停止送新流量過來')
  assert.equal(typeof r.json?.reason, 'string', '503 的 body 要有 reason')
  assert.equal((await get(url, '/healthz')).status, 200, '關機中程序還活著，/healthz 仍是 200')
})
