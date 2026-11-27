// 練習 2：優雅關機
// 執行：node server.ts，另開終端機 curl 'http://localhost:3000/slow?ms=3000'，回到這邊按 Ctrl+C
import { createServer, type ServerResponse } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { createPool } from './pool.ts'

const pool = createPool()
const log = (msg: string, extra: object = {}) => console.log(JSON.stringify({ msg, ...extra }))
let shuttingDown = false

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = Buffer.from(JSON.stringify(data))
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'content-length': String(body.length) }
  // 關機中：請客戶端用完這條連線就關掉，不要留著 keep-alive
  if (shuttingDown) headers.connection = 'close'
  res.writeHead(status, headers)
  res.end(body)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  try {
    // /slow?ms=1000：模擬要花一段時間的請求（例如產生報表），最後查一次資料庫
    if (url.pathname === '/slow') await sleep(Number(url.searchParams.get('ms') ?? 1000))
    const { rows } = await pool.query('SELECT 1')
    sendJson(res, 200, { ok: true, rows })
  } catch (err) {
    console.error(err)
    sendJson(res, 500, { error: { code: 'INTERNAL', message: '伺服器發生錯誤' } })
  }
})

server.listen(Number(process.env.PORT ?? 3000), () => {
  const { port } = server.address() as { port: number }
  log('listening', { port })
})

async function shutdown(signal: NodeJS.Signals) {
  // 第二次訊號：使用者不想等了
  if (shuttingDown) {
    console.error(JSON.stringify({ msg: 'forced exit', signal }))
    process.exit(1)
  }
  shuttingDown = true
  log('shutting down', { signal })

  // 時限：到了就強制關掉所有連線。unref() 讓這個計時器不會撐住程序
  const timeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 10_000)
  setTimeout(() => {
    console.error(JSON.stringify({ msg: 'shutdown timeout', timeoutMs }))
    server.closeAllConnections()
    process.exit(0)
  }, timeoutMs).unref()

  // 1. 不接新連線；callback 在所有連線都關掉後才呼叫
  await new Promise<void>(resolve => server.close(() => resolve()))
  log('server closed')
  // 2. 沒有請求在用資料庫了，才關 pool
  await pool.end()
  // 3. 沒有東西撐住 event loop，程序自然以 0 結束
  log('bye')
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
