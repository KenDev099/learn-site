// 咖啡店 API 的精簡版：第 11 課只需要健康檢查、商品和 /config
import { createServer, type ServerResponse } from 'node:http'
import { hostname } from 'node:os'
import pg from 'pg'
import { pino } from 'pino'
import { loadConfig } from './config.js'

const config = loadConfig()
const PORT = Number(process.env.PORT ?? 3000)
const log = pino({ level: config.logLevel, base: { service: 'cafe-api', env: config.appEnv } })
const pool = new pg.Pool({ ...config.db, max: 5, connectionTimeoutMillis: 2_000 })
pool.on('error', e => log.error({ err: e }, 'idle client error'))

const products = [
  { id: 1, name: '美式咖啡', price: 80 },
  { id: 2, name: '拿鐵', price: 110 },
  { id: 3, name: '卡布奇諾', price: 110 },
  { id: 4, name: '伯爵紅茶', price: 90 },
  { id: 5, name: '可頌', price: 70 },
  { id: 6, name: '起司蛋糕', price: 120 },
]

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  res.setHeader('x-instance', hostname())
  res.on('finish', () => log.info({ method: req.method, path: req.url, status: res.statusCode }, 'request'))
  if (req.method !== 'GET') return json(res, 404, { error: 'not found' })
  if (req.url === '/health/live') return json(res, 200, { status: 'ok' })
  if (req.url === '/health/ready') {
    try {
      await pool.query('SELECT 1')
      return json(res, 200, { status: 'ready' })
    } catch (e) {
      // 原因寫進 log，不回給呼叫的人
      log.warn({ err: e }, 'database not reachable')
      return json(res, 503, { status: 'not ready' })
    }
  }
  // 只回非機密的設定，方便確認部署拿到的值；絕不回傳密碼
  if (req.url === '/config')
    return json(res, 200, { appEnv: config.appEnv, logLevel: config.logLevel, featureLoyalty: config.featureLoyalty })
  if (req.url === '/products') return json(res, 200, products)
  json(res, 404, { error: 'not found' })
})

server.listen(PORT, '0.0.0.0', () => log.info({ port: PORT }, 'cafe-api listening'))
process.on('SIGTERM', () => {
  log.info('SIGTERM received, closing')
  server.close(() => pool.end().then(() => process.exit(0)))
  server.closeIdleConnections()
})
