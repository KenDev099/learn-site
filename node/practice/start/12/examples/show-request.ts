// 執行：node examples/show-request.ts（預設 port 3000，可以用 PORT=3001 node examples/show-request.ts 換）
// 一個用 node:net 寫的「照妖鏡」：把收到的原始請求印出來，再回一個最小的 HTTP 回應
// 開著它，另開一個終端機執行 curl，例如：
//   curl http://localhost:3000/menu
//   curl -d '{"drink":"拿鐵"}' http://localhost:3000/orders
//   curl --json '{"drink":"拿鐵"}' http://localhost:3000/orders
// 按 Ctrl+C 結束
import { createServer } from 'node:net'

const port = Number(process.env.PORT ?? 3000)

const server = createServer(socket => {
  socket.on('data', chunk => {
    // JSON.stringify 讓 \r\n 現形；一個請求可能分好幾段 data 到達
    console.log(`收到 ${chunk.length} 個位元組：`)
    console.log(JSON.stringify(chunk.toString('utf8')))
    const body = 'ok\n'
    socket.end(`HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`)
  })
})
server.listen(port, () => console.log(`在 http://localhost:${port} 等請求`))
