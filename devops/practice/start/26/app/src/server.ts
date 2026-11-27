// 期末專題的 cafe-api：前面各課的 app 合在一起（這個資料夾除了 Dockerfile、.dockerignore 之外都不用改）
// - 設定：DB_HOST、DB_NAME、DB_USER、DB_PASSWORD_FILE（或 DB_PASSWORD）、REDIS_URL；APP_VERSION、GIT_SHA 由映像帶進來
// - GET /health/live、/health/ready（暖機完成、DB 與 Redis 連得上、這個版本的 migration 都套用了、不在排空中）、/version、/metrics
// - GET /products、POST /orders、GET /orders/:id、POST /cart/items、GET /cart（cookie sid，存在 Redis）、POST /uploads（最大 5MB）
// - SIGTERM：readiness 先變 503、繼續服務 DRAIN_MS 毫秒、再關閉（第 13 課）
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import { readdirSync } from 'node:fs'
import pg from 'pg'
import { Redis } from 'ioredis'
import { pino } from 'pino'
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client'
import { dbConfig } from './config.js'

const PORT = Number(process.env.PORT ?? 3000)
const VERSION = process.env.APP_VERSION ?? 'dev'
const SHA = process.env.GIT_SHA ?? 'unknown'
const DRAIN_MS = Number(process.env.DRAIN_MS ?? 3_000)
const MAX_UPLOAD = 5 * 1024 * 1024
const log = pino({ base: { service: 'cafe-api', version: VERSION, instance: hostname() } })

if (!process.env.REDIS_URL) {
  console.error('缺少環境變數 REDIS_URL')
  process.exit(1)
}
const pool = new pg.Pool({ ...dbConfig(), max: Number(process.env.DB_POOL_SIZE ?? 8), connectionTimeoutMillis: 5_000, idleTimeoutMillis: 60_000 })
pool.on('error', e => log.error({ err: e }, 'idle client error'))
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true })
redis.on('error', e => log.warn({ err: e }, 'redis error'))

// 這個版本需要的 migration：映像裡 migrations/ 的檔名（不含副檔名）
const wanted = readdirSync('migrations').filter(f => f.endsWith('.sql')).map(f => f.slice(0, -4))
let migrated = false
let draining = false

// 啟動後的暖機：真實的服務要建立連線池、載入快取、讓 JIT 熱起來，這段時間還不能接流量。
// 這裡用 WARMUP_MS（預設 5 秒）模擬：暖機完成前 /health/ready 回 503，業務路由也回 503。
// /health/live 一啟動就是 200：程序活著，不代表準備好了
let warm = false
setTimeout(() => { warm = true; log.info('warm-up complete') }, Number(process.env.WARMUP_MS ?? 5_000))

const register = new Registry()
collectDefaultMetrics({ register })
const requests = new Counter({ name: 'http_requests_total', help: 'HTTP 請求數', labelNames: ['method', 'route', 'status'], registers: [register] })
const duration = new Histogram({ name: 'http_request_duration_seconds', help: 'HTTP 請求耗時（秒）', labelNames: ['method', 'route'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5], registers: [register] })

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString() || '{}')
}

function sessionId(req: IncomingMessage, res: ServerResponse): string {
  const sid = /(?:^|;\s*)sid=([\w-]+)/.exec(req.headers.cookie ?? '')?.[1]
  if (sid) return sid
  const fresh = randomUUID()
  res.setHeader('set-cookie', `sid=${fresh}; Path=/; HttpOnly; Secure; SameSite=Lax`)
  return fresh
}

async function ready(): Promise<boolean> {
  if (draining || !warm) return false
  try {
    if (redis.status === 'wait') await redis.connect()
    await Promise.all([pool.query('SELECT 1'), redis.ping()])
    if (!migrated) {
      const { rows } = await pool.query('SELECT name FROM pgmigrations')
      const done = new Set(rows.map(r => r.name))
      migrated = wanted.every(n => done.has(n))
      if (!migrated) log.warn({ missing: wanted.filter(n => !done.has(n)) }, 'migration 還沒套用')
    }
    return migrated
  } catch (e) {
    log.warn({ err: e }, 'dependency not ready')
    return false
  }
}

// 路由表：route 是樣板（/orders/:id），當指標與 log 的 label，不會因為每個 id 都不同而爆量
type Handler = (req: IncomingMessage, res: ServerResponse, params: string[]) => Promise<void> | void
const routes: [string, string, RegExp, Handler][] = [
  ['GET', '/health/live', /^\/health\/live$/, (_q, res) => json(res, 200, { status: 'ok' })],
  ['GET', '/health/ready', /^\/health\/ready$/, async (_q, res) => {
    const ok = await ready()
    json(res, ok ? 200 : 503, { status: ok ? 'ready' : 'not ready' })
  }],
  ['GET', '/version', /^\/version$/, (_q, res) => json(res, 200, { version: VERSION, sha: SHA })],
  ['GET', '/metrics', /^\/metrics$/, async (_q, res) => {
    res.writeHead(200, { 'content-type': register.contentType })
    res.end(await register.metrics())
  }],
  ['GET', '/products', /^\/products$/, async (_q, res) => {
    const { rows } = await pool.query('SELECT id, name, price FROM products ORDER BY id')
    json(res, 200, rows)
  }],
  ['POST', '/orders', /^\/orders$/, async (req, res) => {
    const { productId, quantity = 1 } = await readJson(req)
    const { rows } = await pool.query('INSERT INTO orders (total) SELECT price * $2 FROM products WHERE id = $1 RETURNING id, total', [productId, quantity])
    if (!rows.length) return json(res, 400, { error: `沒有編號 ${productId} 的商品` })
    json(res, 201, rows[0])
  }],
  ['GET', '/orders/:id', /^\/orders\/(\d+)$/, async (_q, res, [id]) => {
    const { rows } = await pool.query('SELECT id, total, ordered_at FROM orders WHERE id = $1', [id])
    rows.length ? json(res, 200, rows[0]) : json(res, 404, { error: 'not found' })
  }],
  ['POST', '/cart/items', /^\/cart\/items$/, async (req, res) => {
    const sid = sessionId(req, res)
    const { productId } = await readJson(req)
    if (!Number.isInteger(productId)) return json(res, 400, { error: 'productId 要是整數' })
    await redis.multi().rpush(`cart:${sid}`, productId).expire(`cart:${sid}`, 86_400).exec()
    json(res, 201, { items: (await redis.lrange(`cart:${sid}`, 0, -1)).map(Number) })
  }],
  ['GET', '/cart', /^\/cart$/, async (req, res) => {
    const sid = sessionId(req, res)
    json(res, 200, { items: (await redis.lrange(`cart:${sid}`, 0, -1)).map(Number) })
  }],
  ['POST', '/uploads', /^\/uploads$/, async (req, res) => {
    let bytes = 0
    for await (const chunk of req) {
      bytes += chunk.length
      if (bytes > MAX_UPLOAD) {
        res.setHeader('connection', 'close')
        return json(res, 413, { error: '檔案超過 5MB' })
      }
    }
    json(res, 200, { bytes })
  }],
]

const server = createServer(async (req, res) => {
  const started = process.hrtime.bigint()
  const requestId = String(req.headers['x-request-id'] ?? randomUUID())
  res.setHeader('x-instance', hostname())
  res.setHeader('x-request-id', requestId)
  if (draining) res.setHeader('connection', 'close')
  const path = new URL(req.url ?? '/', 'http://x').pathname
  let route = 'unmatched'
  let handler: Handler | undefined, params: string[] = []
  for (const [method, name, re, h] of routes) {
    const m = re.exec(path)
    if (m && method === req.method) { route = name; handler = h; params = m.slice(1); break }
  }
  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - started) / 1e9
    requests.inc({ method: req.method, route, status: res.statusCode })
    duration.observe({ method: req.method, route }, seconds)
    if (!route.startsWith('/health') && route !== '/metrics')
      log.info({ request_id: requestId, method: req.method, route, path, status: res.statusCode, duration_ms: Math.round(seconds * 1000) }, 'request')
  })
  try {
    if (!handler) return json(res, 404, { error: 'not found' })
    if (!warm && !route.startsWith('/health') && route !== '/version' && route !== '/metrics') {
      res.setHeader('retry-after', '1')
      return json(res, 503, { error: '還在暖機' })
    }
    await handler(req, res, params)
  } catch (e) {
    log.error({ request_id: requestId, err: e }, 'request failed')
    if (!res.headersSent) json(res, 500, { error: 'internal error' })
  }
})

// 比前面代理的閒置逾時長，由代理先關連線（第 13 課）
server.keepAliveTimeout = Number(process.env.KEEPALIVE_TIMEOUT_MS ?? 65_000)
process.once('SIGTERM', () => {
  log.info({ drain_ms: DRAIN_MS }, 'SIGTERM received, draining')
  draining = true
  setTimeout(() => {
    server.close(async () => {
      await pool.end()
      redis.disconnect()
      log.info('shutdown complete')
      process.exit(0)
    })
    server.closeIdleConnections()
  }, DRAIN_MS)
})
server.listen(PORT, '0.0.0.0', () => log.info({ port: PORT }, 'cafe-api listening'))
