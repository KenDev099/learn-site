// 練習 1：咖啡店 API 的最小版本，只有 /health/live
// 在容器裡執行：node /app/server.mjs（run.sh 會把這個檔案掛進容器）
import { createServer } from 'node:http'

const PORT = 3000
const HOST = 'localhost'

const server = createServer((req, res) => {
  if (req.url === '/health/live') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"status":"ok"}')
    return
  }
  res.writeHead(404)
  res.end()
})

server.listen(PORT, HOST, () => console.log(`listening on ${HOST}:${PORT}`))
process.on('SIGTERM', () => server.close(() => process.exit(0)))
