// 咖啡店 API 的縮小版（這個檔案不用改）：只用 Node 內建模組，伺服器上有 node 就能跑
// 設定全部從環境變數來：PORT、APP_ENV、DB_PASSWORD
import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 3000)
const server = createServer((req, res) => {
  if (req.url !== '/health/live') { res.statusCode = 404; return res.end('not found') }
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({
    status: 'ok',
    env: process.env.APP_ENV ?? null,
    user: process.env.USER ?? null,
    dbPasswordSet: Boolean(process.env.DB_PASSWORD),
  }))
})
server.listen(port, () => console.log(`listening on ${port}, pid ${process.pid}, env ${process.env.APP_ENV}`))

process.on('SIGTERM', () => {
  console.log('收到 SIGTERM，開始關機')
  server.close(() => {
    console.log('shutdown complete')
    process.exit(0)
  })
  server.closeIdleConnections()
})
