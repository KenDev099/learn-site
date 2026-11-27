// 練習 2：只用 node:net 寫一個會回 HTTP 回應的伺服器
// 收到標頭結尾的空行（\r\n\r\n）之後，回這個回應並關閉連線：
//   HTTP/1.1 200 OK
//   Content-Type: application/json; charset=utf-8
//   Content-Length: （body 的位元組數）
//   Connection: close
//   （空行）
//   {"message":"歡迎光臨"}
// 試跑：node raw-server.ts，再到另一個終端機 curl -i http://localhost:3000/
import { createServer, type Server } from 'node:net'

export function createRawServer(): Server {
  return createServer(socket => {
    // 在這裡寫：收集 socket 收到的 data，看到 \r\n\r\n 才回應
  })
}

// 直接執行這個檔案時才開 port；被測試 import 時不會
if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000)
  createRawServer().listen(port, () => console.log(`在 http://localhost:${port} 等請求`))
}
