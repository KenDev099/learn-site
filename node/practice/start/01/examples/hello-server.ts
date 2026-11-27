// 執行：node examples/hello-server.ts，然後用瀏覽器打開 http://localhost:3000
// 終端機會停在這裡等請求，這是正常的；要停止就在終端機按 Ctrl+C
import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 3000)

const server = createServer((req, res) => {
  console.log('收到請求：', req.method, req.url)
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('☕ 歡迎光臨咖啡店！\n')
})

server.listen(port, () => {
  console.log(`伺服器已啟動：http://localhost:${port}（按 Ctrl+C 停止）`)
})
