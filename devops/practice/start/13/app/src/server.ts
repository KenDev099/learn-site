// 第 13 課的 cafe-api：一份程式會同時跑好幾個副本，前面由 nginx 分流
// 這個檔案不用改。練習 1 改 cart.ts，練習 3 改 lifecycle.ts
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { Redis } from 'ioredis'
import { pino } from 'pino'
import { addItem, getCart } from './cart.js'
import { live, onRequest, ready, setup } from './lifecycle.js'

const PORT = Number(process.env.PORT ?? 3000)
const DEBUG = process.env.DEBUG_ENDPOINTS === '1'
const log = pino({ base: { service: 'cafe-api', instance: hostname() } })

for (const name of ['DATABASE_URL', 'REDIS_URL']) {
  if (!process.env[name]) {
    log.fatal(`缺少環境變數 ${name}`)
    process.exit(1)
  }
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 2_000 })
pool.on('error', e => log.error({ err: e }, 'idle client error'))
const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 2 })
redis.on('error', e => log.warn({ err: e }, 'redis error'))

// 錯誤注入（DEBUG_ENDPOINTS=1 才有）：只影響收到這個請求的那一個副本
let failMode = 'off'

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString() || '{}')
}

// 購物車用 cookie 裡的 sid 認人；沒有就發一個新的
function sessionId(req: IncomingMessage, res: ServerResponse): string {
  const sid = /(?:^|;\s*)sid=([\w-]+)/.exec(req.headers.cookie ?? '')?.[1]
  if (sid) return sid
  const fresh = randomUUID()
  res.setHeader('set-cookie', `sid=${fresh}; Path=/; HttpOnly; SameSite=Lax`)
  return fresh
}

async function depsOk(): Promise<boolean> {
  try {
    await Promise.all([pool.query('SELECT 1'), redis.ping()])
    return true
  } catch (e) {
    log.warn({ err: e }, 'dependency not reachable')
    return false
  }
}

const server = createServer(async (req, res) => {
  const started = Date.now()
  res.setHeader('x-instance', hostname())
  onRequest(res)
  res.on('finish', () => log.info({ method: req.method, path: req.url, status: res.statusCode, duration_ms: Date.now() - started }, 'request'))
  const url = new URL(req.url ?? '/', 'http://x')
  const route = `${req.method} ${url.pathname}`
  try {
    if (route === 'GET /health/live') {
      const status = live()
      return json(res, status, { status: status === 200 ? 'ok' : 'fail' })
    }
    if (route === 'GET /health/ready') {
      const status = ready(await depsOk())
      return json(res, status, { status: status === 200 ? 'ready' : 'not ready' })
    }
    if (route === 'GET /products') {
      const { rows } = await pool.query('SELECT id, name, price FROM products ORDER BY id')
      return json(res, 200, rows)
    }
    if (route === 'POST /orders') {
      const { productId, quantity = 1, note = null, slowMs = 0 } = await readBody(req)
      // 模擬比較慢的請求（只在 DEBUG_ENDPOINTS=1 時有效），讓「處理到一半」的時間夠長
      if (DEBUG && slowMs > 0) await new Promise(r => setTimeout(r, Math.min(Number(slowMs), 5_000)))
      const { rows } = await pool.query(
        `INSERT INTO orders (total, note) SELECT price * $2, $3 FROM products WHERE id = $1 RETURNING id, total`,
        [productId, quantity, note])
      if (!rows.length) return json(res, 400, { error: `沒有編號 ${productId} 的商品` })
      // 503-after-write：訂單已經寫進資料庫，回應卻是失敗。模擬「做完了但回應失敗」
      if (failMode === '503-after-write') return json(res, 503, { error: 'injected failure' })
      return json(res, 201, rows[0])
    }
    if (route === 'POST /cart/items') {
      const sid = sessionId(req, res)
      const { productId } = await readBody(req)
      if (!Number.isInteger(productId)) return json(res, 400, { error: 'productId 要是整數' })
      await addItem(redis, sid, productId)
      return json(res, 201, { items: await getCart(redis, sid) })
    }
    if (route === 'GET /cart') {
      const sid = sessionId(req, res)
      return json(res, 200, { items: await getCart(redis, sid) })
    }
    if (DEBUG && route === 'POST /test/fail') {
      failMode = url.searchParams.get('mode') === '503-after-write' ? '503-after-write' : 'off'
      return json(res, 200, { instance: hostname(), failMode })
    }
    // 只回非機密的設定，方便確認這個副本實際用的值
    if (DEBUG && route === 'GET /config')
      return json(res, 200, { instance: hostname(), keepAliveTimeout: server.keepAliveTimeout })
    json(res, 404, { error: 'not found' })
  } catch (e) {
    log.error({ err: e }, 'request failed')
    if (!res.headersSent) json(res, 500, { error: 'internal error' })
  }
})

setup(server, async () => {
  await pool.end()
  await redis.quit()
}, log)
server.listen(PORT, '0.0.0.0', () => log.info({ port: PORT }, 'cafe-api listening'))
