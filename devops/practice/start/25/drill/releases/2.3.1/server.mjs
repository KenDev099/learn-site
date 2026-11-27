// cafe-api 2.3.1（演練用的精簡版）
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const VERSION = process.env.APP_VERSION
const PRODUCTS = [
  { id: 1, name: '美式咖啡', price: 80 }, { id: 2, name: '拿鐵', price: 110 }, { id: 3, name: '卡布奇諾', price: 110 },
  { id: 4, name: '伯爵紅茶', price: 90 }, { id: 5, name: '可頌', price: 70 }, { id: 6, name: '起司蛋糕', price: 120 },
]
const log = o => console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'cafe-api', version: VERSION, ...o }))

// 功能旗標：啟動時讀一次，收到 SIGHUP 重新讀（第 3 課）
let flags = {}
function loadFlags() {
  flags = JSON.parse(readFileSync(process.env.FLAGS_FILE, 'utf8'))
  log({ level: 'info', msg: 'flags loaded', flags })
}
loadFlags()
process.on('SIGHUP', () => { try { loadFlags() } catch (e) { log({ level: 'error', msg: 'flags reload failed', err: e.message }) } })

const counts = new Map()
const count = (route, status) => { const k = `${route}|${status}`; counts.set(k, (counts.get(k) ?? 0) + 1) }
function metrics() {
  const lines = ['# TYPE http_requests_total counter']
  for (const [k, n] of [...counts].sort()) { const [route, status] = k.split('|'); lines.push(`http_requests_total{route="${route}",status="${status}"} ${n}`) }
  lines.push('# TYPE cafe_feature_flag gauge')
  for (const [name, on] of Object.entries(flags)) lines.push(`cafe_feature_flag{flag="${name}"} ${on ? 1 : 0}`)
  lines.push(`cafe_build_info{version="${VERSION}"} 1`)
  return lines.join('\n') + '\n'
}

let nextId = 1
function createOrder(input) {
  const product = PRODUCTS.find(p => p.id === input.product_id)
  if (!product || !Number.isInteger(input.quantity)) return [400, { error: 'invalid order' }]
  const total = product.price * input.quantity
  return [201, { id: nextId++, product_id: product.id, quantity: input.quantity, total }]
}

async function readJson(req) {
  let text = ''
  for await (const chunk of req) text += chunk
  return JSON.parse(text || '{}')
}

const server = createServer(async (req, res) => {
  const started = performance.now()
  const requestId = req.headers['x-request-id'] || randomUUID()
  const path = new URL(req.url, 'http://x').pathname
  const route = ['/health', '/metrics', '/products', '/orders'].includes(path) ? path : 'unmatched'
  let status = 500, body = ''
  try {
    if (path === '/health') [status, body] = [200, { ok: true, version: VERSION }]
    else if (path === '/metrics') [status, body] = [200, metrics()]
    else if (path === '/products' && req.method === 'GET') [status, body] = [200, PRODUCTS]
    else if (path === '/orders' && req.method === 'POST') [status, body] = createOrder(await readJson(req))
    else [status, body] = [404, { error: 'not found' }]
  } catch (e) {
    [status, body] = [500, { error: 'internal error', request_id: requestId }]
    log({ level: 'error', msg: 'unhandled error', request_id: requestId, route, err: e.message, stack: e.stack.split('\n').slice(0, 3).join(' | ') })
  }
  res.writeHead(status, { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json', 'x-request-id': requestId, 'x-version': VERSION })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
  if (route !== '/metrics' && route !== '/health') count(route, status)
  if (route !== '/health') log({ level: status >= 500 ? 'error' : 'info', msg: 'request', request_id: requestId, method: req.method, route, status, duration_ms: Math.round(performance.now() - started) })
})
server.listen(3000, () => log({ level: 'info', msg: 'listening', port: 3000 }))
process.on('SIGTERM', () => server.close(() => process.exit(0)))
