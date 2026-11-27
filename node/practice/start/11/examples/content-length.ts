// 執行：node examples/content-length.ts
// 用字串長度當 Content-Length，客戶端收到的 body 會被截斷
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

const body = JSON.stringify({ name: '拿鐵', price: 110 })

const server = createServer((req, res) => {
  const length = req.url === '/bytes' ? Buffer.byteLength(body) : body.length
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': length })
  res.end(body)
})
server.listen(0, async () => {
  const { port } = server.address() as AddressInfo
  console.log('body.length =', body.length, 'Buffer.byteLength =', Buffer.byteLength(body))
  for (const path of ['/chars', '/bytes']) {
    const text = await (await fetch(`http://localhost:${port}${path}`)).text()
    console.log(path, '收到：', text)
  }
  server.closeAllConnections()
  server.close()
})
