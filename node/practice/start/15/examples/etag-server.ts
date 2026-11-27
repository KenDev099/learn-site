// 一個會回 ETag、會回 304 的小伺服器，用 curl 觀察條件請求
// 執行：node examples/etag-server.ts，另開終端機用 curl -i 試試看
import { createServer } from 'node:http'
import { hash } from 'node:crypto'

const special = { name: '今日特調：桂花拿鐵', price: 130 }

const server = createServer((req, res) => {
  const body = JSON.stringify(special)
  const etag = `"${hash('sha256', body, 'base64url')}"`
  const headers = { etag, 'cache-control': 'public, max-age=60' }
  if (req.headers['if-none-match'] === etag) {   // 簡化版：只比對單一個 ETag，練習 1 會寫完整版
    res.writeHead(304, headers)
    return res.end()
  }
  res.writeHead(200, { ...headers, 'content-type': 'application/json; charset=utf-8' })
  res.end(body)
})

server.listen(Number(process.env.PORT ?? 3000), () => {
  const { port } = server.address() as { port: number }
  console.log(JSON.stringify({ msg: 'listening', port }))
})
