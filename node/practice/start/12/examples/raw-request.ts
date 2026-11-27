// 執行：node examples/raw-request.ts
// 不用 fetch，直接用 node:net 開一條 TCP 連線，自己打出 HTTP 請求的文字，再把伺服器回的原始位元組印出來
import { createServer } from 'node:http'
import { connect } from 'node:net'

// 先在本機開一個普通的 HTTP 伺服器當對象（第 13 課會詳講 node:http）
const server = createServer((req, res) => {
  console.log('伺服器看到的標頭（名稱都轉成小寫了）：', req.headers)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ drink: '拿鐵', price: 110 }))
})
server.listen(0, '127.0.0.1', () => {
  const { port } = server.address() as { port: number }

  // 客戶端：連到 127.0.0.1 的這個 port
  const socket = connect(port, '127.0.0.1', () => {
    // 請求行、標頭、空行；每一行用 \r\n 結尾，GET 沒有 body
    socket.write('GET /menu?size=L HTTP/1.1\r\n')
    socket.write(`Host: localhost:${port}\r\n`)
    socket.write('Accept: application/json\r\n')
    socket.write('Connection: close\r\n')   // 請伺服器回完就關掉連線
    socket.write('\r\n')
  })

  const chunks: Buffer[] = []
  socket.on('data', chunk => chunks.push(chunk))   // 收到的是 Buffer（第 11 課）
  socket.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8')
    console.log('---- 原始回應（\\r\\n 顯示成 ⏎）----')
    console.log(raw.replaceAll('\r\n', '⏎\n'))
    server.close()
  })
})
