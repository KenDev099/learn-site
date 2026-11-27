// 測試共用的小工具：測試用，學習者不用讀，也不用改
import assert from 'node:assert/strict'
import { join } from 'node:path'
import pg from 'pg'
import { after } from 'node:test'
import type { Server } from 'node:http'
import type { EventEmitter } from 'node:events'
import { COFFEE_SQL, createTestDb } from '../../helpers/db.ts'
import { listen } from '../../helpers/http.ts'

export const opts = { timeout: 20_000 }
export const SCHEMA = join(import.meta.dirname, 'schema.sql')
export const MAIN = join(import.meta.dirname, 'main.ts')

export const setupDb = () => createTestDb([COFFEE_SQL, SCHEMA])

// 啟動 main.ts 用的環境變數
export const mainEnv = (databaseUrl: string, more: Record<string, string> = {}) => ({
  DATABASE_URL: databaseUrl, SUPPLIER_URL: 'http://127.0.0.1:9', LOG_LEVEL: 'info', SHUTDOWN_TIMEOUT_MS: '', ENABLE_TEST_ROUTES: '', ...more,
})

type App = { server: Server, startShutdown: () => void, orderEvents?: EventEmitter }

// 在測試程序裡建立 app：用學習者的 createApp，資料庫連線池由測試建立
export async function startApp(databaseUrl: string, config: Record<string, unknown> = {}) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 1000 })
  pool.on('error', () => {})
  after(() => pool.end())
  const mod: { createApp?: unknown } = await import('./app.ts')
  assert.equal(typeof mod.createApp, 'function', 'app.ts 要 export function createApp({ config, pool, logger })')
  const logMod: { createLogger?: unknown } = await import('./platform/logger.ts')
  const lines: string[] = []
  const logger = (logMod.createLogger as (o: object) => unknown)({ level: 'debug', write: (l: string) => { lines.push(l) } })
  const fullConfig = { port: 0, databaseUrl, logLevel: 'debug', supplierUrl: 'http://127.0.0.1:9', shutdownTimeoutMs: 10_000, enableTestRoutes: false, ...config }
  const app = (mod.createApp as (d: object) => App)({ config: fullConfig, pool, logger })
  assert.ok(app?.server, 'createApp 要回傳 { server, startShutdown, orderEvents }')
  const { url } = await listen(app.server)
  return { app, url, pool, lines }
}

// 送請求並把 body 讀成文字與 JSON（不是 JSON 時 json 是 undefined）
export async function call(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 3000, ...rest } = init
  const t0 = performance.now()
  let res: Response
  try {
    res = await fetch(url, { ...rest, signal: rest.signal ?? AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    assert.fail(`${rest.method ?? 'GET'} ${new URL(url).pathname} 在 ${timeoutMs / 1000} 秒內沒有回應（${(err as Error).name}）`)
  }
  const text = await res.text()
  let json: any
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, headers: res.headers, text, json, ms: performance.now() - t0 }
}

export const postJson = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  call(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
export const patchJson = (url: string, body: unknown) =>
  call(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

// problem details（第 14 課）的基本檢查
export function assertProblem(r: Awaited<ReturnType<typeof call>>, status: number, kind: string, what: string) {
  assert.equal(r.status, status, `${what}：狀態碼要是 ${status}，實際 ${r.status}（body：${r.text.slice(0, 200)}）`)
  assert.match(r.headers.get('content-type') ?? '', /^application\/problem\+json/, `${what}：Content-Type 要是 application/problem+json`)
  assert.equal(r.json?.type, `https://coffee.example/problems/${kind}`, `${what}：problem 的 type 要是 …/problems/${kind}`)
}

// 把 stdout 的每一行 JSON 解析出來
export const logLines = (stdout: string): Record<string, any>[] => stdout.split('\n').flatMap(l => {
  try { return [JSON.parse(l)] } catch { return [] }
})

// 等到 cond() 為真，最多 ms 毫秒
export async function waitFor(cond: () => boolean | Promise<boolean>, ms = 1500) {
  const end = performance.now() + ms
  while (performance.now() < end) {
    if (await cond()) return true
    await new Promise(r => setTimeout(r, 20))
  }
  return cond()
}
