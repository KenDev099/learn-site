// 咖啡店 API 的縮小版：只有 /health/live，收到 SIGTERM 會優雅關機（這個檔案不用改）
import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 3000)
const server = createServer((req, res) => {
  if (req.url === '/health/live') return res.end('ok')
  res.statusCode = 404
  res.end('not found')
})
server.listen(port, '0.0.0.0', () => console.log(`listening on ${port}, pid ${process.pid}`))

process.on('SIGTERM', () => {
  console.log('收到 SIGTERM，開始關機')
  server.close(() => {
    console.log('shutdown complete')
    process.exit(0)
  })
  server.closeIdleConnections()
})
