// 第 16 課的 cafe-api（精簡版，資料放在記憶體）。這個檔案不用改
// 啟動要 1.5 秒（模擬載入設定、連資料庫），這段時間連 port 都還沒開
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { hostname } from 'node:os'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const VERSION = process.env.APP_VERSION || pkg.version
const BROKEN = process.env.BROKEN_READY === '1'
const products = [
  { id: 1, name: '美式咖啡', price: 80 },
  { id: 2, name: '拿鐵', price: 110 },
  { id: 3, name: '卡布奇諾', price: 110 },
  { id: 4, name: '伯爵紅茶', price: 90 },
  { id: 5, name: '可頌', price: 70 },
  { id: 6, name: '起司蛋糕', price: 120 },
]
let nextOrder = 1

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'x-version': VERSION })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  const route = `${req.method} ${new URL(req.url ?? '/', 'http://x').pathname}`
  if (route === 'GET /health/live') return json(res, 200, { status: 'ok' })
  if (route === 'GET /health/ready') return BROKEN ? json(res, 503, { status: 'not ready' }) : json(res, 200, { status: 'ready' })
  if (route === 'GET /version') return json(res, 200, { version: VERSION, instance: hostname() })
  if (route === 'GET /products') return json(res, 200, products)
  if (route === 'POST /orders') {
    let body = ''
    for await (const chunk of req) body += chunk
    const { productId, quantity = 1 } = JSON.parse(body || '{}')
    const p = products.find(x => x.id === productId)
    if (!p) return json(res, 400, { error: `沒有編號 ${productId} 的商品` })
    return json(res, 201, { id: nextOrder++, total: p.price * quantity })
  }
  json(res, 404, { error: 'not found' })
})
// 要比 nginx 對 upstream 的閒置逾時（60 秒）長，否則偶爾會 502（第 12 課）
server.keepAliveTimeout = 65_000
process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
  server.closeIdleConnections()
  setTimeout(() => process.exit(0), 5_000).unref()
})
setTimeout(() => server.listen(3000, '0.0.0.0', () => console.log(`cafe-api ${VERSION} listening on 3000`)), 1_500)
