// 練習 3 的結帳 API（不用改）：POST /checkout 一定失敗，錯誤 log 會把請求標頭與 body 整個記下來
// 自己試：node server.ts（PORT 沒設時由系統分配，log 第一行會印出 port）
// curl -i -X POST localhost:<port>/checkout -H 'authorization: Bearer abc' -H 'cookie: sid=xyz' \
//   -d '{"email":"ming@cafe.test","password":"hunter2","items":[{"productId":2,"quantity":1}],"payment":{"card":{"number":"4111111111111111","exp":"12/29"}}}'
import { createServer, type IncomingMessage } from 'node:http'
import { randomUUID } from 'node:crypto'
import { log } from './logger.ts'

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString() || '{}')
}

const server = createServer(async (req, res) => {
  const started = performance.now()
  const request_id = String(req.headers['x-request-id'] ?? randomUUID())
  const route = req.method === 'POST' && req.url === '/checkout' ? 'POST /checkout' : 'unknown'
  res.setHeader('x-request-id', request_id)
  res.on('finish', () => log.info({ request_id, route, status: res.statusCode, duration_ms: Math.round(performance.now() - started) }, 'request'))
  if (route === 'unknown') {
    res.writeHead(404).end()
    return
  }
  const body = await readBody(req)
  try {
    throw new Error('payment gateway timeout')
  } catch (err) {
    // 出錯時把整個請求記下來方便除錯：這正是機密外洩到 log 最常見的寫法，所以 logger 一定要有遮蔽
    log.error({ request_id, route, req: { method: req.method, url: req.url, headers: req.headers }, body, err }, 'checkout failed')
    res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'checkout failed', request_id }))
  }
})

server.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => {
  const addr = server.address()
  log.info({ port: typeof addr === 'object' && addr ? addr.port : null }, 'listening')
})
process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
  server.closeIdleConnections()
})
