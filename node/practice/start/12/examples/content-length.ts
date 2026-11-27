// 執行：node examples/content-length.ts
// 同一段 JSON，用「字串長度」和「位元組數」當 Content-Length，fetch 收到的結果不一樣
import { createServer } from 'node:net'

const body = JSON.stringify({ message: '歡迎光臨' })
console.log('body.length（UTF-16 單位）：', body.length)
console.log('Buffer.byteLength(body)：', Buffer.byteLength(body))

function serve(length: number) {
  return createServer(socket => {
    socket.once('data', () => {
      socket.end(`HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${length}\r\nConnection: close\r\n\r\n${body}`)
    })
  })
}

for (const [label, length] of [['字串長度', body.length], ['位元組數', Buffer.byteLength(body)]] as const) {
  const server = serve(length).listen(0, '127.0.0.1')
  await new Promise(r => server.once('listening', r))
  const { port } = server.address() as { port: number }
  const res = await fetch(`http://127.0.0.1:${port}/`)
  console.log(`Content-Length 用${label}（${length}）→ 收到：${await res.text()}`)
  server.close()
}
