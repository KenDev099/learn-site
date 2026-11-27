// 第 12 課的後端：代替 cafe-api 站在 nginx 後面，只回答測試需要的幾個路徑（不需要建置）
import { createServer } from 'node:http'

const products = [
  { id: 1, name: '美式咖啡', price: 80 },
  { id: 2, name: '拿鐵', price: 110 },
  { id: 3, name: '卡布奇諾', price: 110 },
  { id: 4, name: '伯爵紅茶', price: 90 },
  { id: 5, name: '可頌', price: 70 },
  { id: 6, name: '起司蛋糕', price: 120 },
]

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  const path = req.url.split('?')[0]
  if (req.method === 'GET' && path === '/health') return json(res, 200, { status: 'ok' })
  if (req.method === 'GET' && path === '/products') return json(res, 200, products)
  // 把收到的請求標頭原樣回傳，用來確認 nginx 轉送了什麼
  if (req.method === 'GET' && path === '/debug/headers') return json(res, 200, { path: req.url, headers: req.headers })
  if (req.method === 'POST' && (path === '/uploads' || path === '/orders')) {
    let bytes = 0
    for await (const chunk of req) bytes += chunk.length
    return json(res, 200, { path, bytes })
  }
  json(res, 404, { error: 'not found', path: req.url })
})

// nginx 會重用和後端的閒置連線（upstream keepalive_timeout 預設 60 秒）。
// Node 預設 5 秒就關掉閒置連線，nginx 可能剛好把請求送進正在關的連線而回 502，所以後端要比前面久
server.keepAliveTimeout = 65_000
server.listen(3000, '0.0.0.0', () => console.log('api listening on 3000'))
process.on('SIGTERM', () => server.close(() => process.exit(0)))
