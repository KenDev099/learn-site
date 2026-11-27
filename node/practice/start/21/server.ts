// 練習 2：優雅關機
// 執行：node server.ts，另開終端機 curl 'http://localhost:3000/slow?ms=3000'，回到這邊按 Ctrl+C
import { createServer, type ServerResponse } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { createPool } from './pool.ts'

const pool = createPool()
const log = (msg: string, extra: object = {}) => console.log(JSON.stringify({ msg, ...extra }))

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = Buffer.from(JSON.stringify(data))
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': String(body.length) })
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

// TODO：收到 SIGTERM 或 SIGINT 時優雅關機
//   1. 不再接受新連線，等進行中的請求完成，關掉閒置的 keep-alive 連線；伺服器關好時印 {"msg":"server closed"}
//   2. 然後 await pool.end()（它會印 {"msg":"pool closed"}）
//   3. 最後印 {"msg":"bye"}，以結束碼 0 結束
//   4. SHUTDOWN_TIMEOUT_MS（預設 10000）毫秒內沒做完：強制關閉所有連線，以結束碼 1 結束
//   5. 關機途中又收到訊號：立即以結束碼 1 結束
