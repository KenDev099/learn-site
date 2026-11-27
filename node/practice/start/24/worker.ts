// 練習 1 的 worker：不用改這個檔案，改 primary.ts
// GET /pid 回 { pid }；GET /slow?ms=1500 等一下再回；GET /crash 回應後讓這個程序崩潰
// 環境變數 CRASH_ON_START=1：一啟動就崩潰（模擬設定錯誤、連不上資料庫）
import { createServer } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'

const log = (msg: string, extra: object = {}) => console.log(JSON.stringify({ msg, pid: process.pid, ...extra }))

if (process.env.CRASH_ON_START === '1') {
  console.error(JSON.stringify({ msg: 'crash on start', pid: process.pid, t: Date.now() }))
  process.exit(1)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/slow') await sleep(Number(url.searchParams.get('ms') ?? 1000))
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ pid: process.pid }))
  if (url.pathname === '/crash') {
    // 回應送出後丟出沒人接的錯誤：程序以結束碼 1 結束
    setTimeout(() => { throw new Error('故意崩潰') }, 10)
  }
})

server.listen(Number(process.env.PORT ?? 3000), () => {
  const { port } = server.address() as { port: number }
  log('listening', { port })
})

// 優雅關機（第 21 課）：不接新連線，進行中的請求做完才結束
process.on('SIGTERM', () => {
  log('worker shutting down')
  server.close(() => process.exit(0))
  server.closeIdleConnections()
})
