// 只呼叫 server.close() 會等多久？
// 執行：node examples/keep-alive.ts；再執行 FIX=1 node examples/keep-alive.ts 比較
// 程式自己開伺服器、用 fetch 送一個 1 秒的請求；請求進到伺服器 100ms 後開始關機
import { createServer } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'

const t0 = performance.now()
const at = () => `${Math.round(performance.now() - t0)}ms`
let closing = false

function startClose() {
  closing = true
  console.log(at(), '呼叫 server.close()')
  server.close(() => console.log(at(), 'server.close 的 callback：所有連線都關了'))
}

const server = createServer(async (req, res) => {
  setTimeout(startClose, 100)   // 這時連線正在處理請求，不是閒置的
  await sleep(1000)
  if (closing && process.env.FIX) res.setHeader('connection', 'close')
  res.end('ok')
})
server.listen(0, async () => {
  const { port } = server.address() as { port: number }
  await fetch(`http://localhost:${port}/`).then(r => r.text())
  console.log(at(), '慢請求完成')
})
