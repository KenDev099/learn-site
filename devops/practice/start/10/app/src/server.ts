// 咖啡店 API 的精簡版：第 10 課需要連 PostgreSQL 的健康檢查、商品和訂單
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { hostname } from 'node:os'
import pg from 'pg'
import { pino } from 'pino'

const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '0.0.0.0'
const log = pino({ base: { service: 'cafe-api', version: process.env.APP_VERSION ?? 'dev' } })

// 啟動時驗證設定：缺了就直接結束，不要等到第一個請求才發現
if (!process.env.DATABASE_URL) {
  log.fatal('缺少環境變數 DATABASE_URL，例如 postgres://cafe:密碼@db:5432/cafe')
  process.exit(1)
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 2_000 })
pool.on('error', e => log.error({ err: e }, 'idle client error'))

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString() || '{}')
}

const server = createServer(async (req, res) => {
  const started = Date.now()
  res.setHeader('x-instance', hostname())
  res.on('finish', () => log.info({ method: req.method, path: req.url, status: res.statusCode, duration_ms: Date.now() - started }, 'request'))
  try {
    // liveness：程序活著就好，不檢查任何依賴
    if (req.method === 'GET' && req.url === '/health/live') return json(res, 200, { status: 'ok' })
    // readiness：連得上資料庫才算準備好
    if (req.method === 'GET' && req.url === '/health/ready') {
      try {
        await pool.query('SELECT 1')
        return json(res, 200, { status: 'ready' })
      } catch (e) {
        return json(res, 503, { status: 'not ready', error: (e as Error).message })
      }
    }
    if (req.method === 'GET' && req.url === '/products') {
      const { rows } = await pool.query('SELECT id, name, price FROM products ORDER BY id')
      return json(res, 200, rows)
    }
    if (req.method === 'POST' && req.url === '/orders') {
      const { productId, quantity = 1 } = await readBody(req)
      const { rows } = await pool.query(
        `INSERT INTO orders (total) SELECT price * $2 FROM products WHERE id = $1 RETURNING id, total`, [productId, quantity])
      if (!rows.length) return json(res, 400, { error: `沒有編號 ${productId} 的商品` })
      return json(res, 201, rows[0])
    }
    const m = req.url?.match(/^\/orders\/(\d+)$/)
    if (req.method === 'GET' && m) {
      const { rows } = await pool.query('SELECT id, total, ordered_at FROM orders WHERE id = $1', [m[1]])
      return rows.length ? json(res, 200, rows[0]) : json(res, 404, { error: 'not found' })
    }
    json(res, 404, { error: 'not found' })
  } catch (e) {
    log.error({ err: e }, 'request failed')
    if (!res.headersSent) json(res, 500, { error: (e as Error).message })
  }
})

server.listen(PORT, HOST, () => log.info({ port: PORT }, 'cafe-api listening'))
process.on('SIGTERM', () => {
  log.info('SIGTERM received, closing')
  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
  server.closeIdleConnections()
})
