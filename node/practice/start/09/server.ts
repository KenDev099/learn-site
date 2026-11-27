// 報表 API（已寫好，不用改；node:http 的寫法第 13 課才教）
// GET /health → { ok: true }
// GET /reports/daily?day=1&count=200000 → 那天的報表（交給 pool 在 worker 裡算）
// 執行：node server.ts，再用瀏覽器或 curl 打 http://localhost:3000/reports/daily?day=1
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { Job, WorkerReport } from './report-worker.ts'
import { createReportPool } from './report-pool.ts'

type Pool = { run(job: Job): Promise<WorkerReport> }

export function createApp(pool: Pool): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/health') return send(res, 200, { ok: true })
    if (url.pathname === '/reports/daily') {
      const day = Number(url.searchParams.get('day') ?? 1)
      const count = Number(url.searchParams.get('count') ?? 200_000)
      try {
        send(res, 200, await pool.run({ day, count }))
      } catch (err) {
        send(res, 500, { error: err instanceof Error ? err.message : String(err) })
      }
      return
    }
    send(res, 404, { error: 'not found' })
  })
}

function send(res: ServerResponse, status: number, body: unknown) {
  const buf = Buffer.from(JSON.stringify(body))   // 先轉成 Buffer、寫明長度
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': buf.length })
  res.end(buf)
}

if (import.meta.main) {
  const pool = createReportPool({ size: 2 })
  const server = createApp(pool)
  server.listen(Number(process.env.PORT ?? 3000), () => {
    const { port } = server.address() as { port: number }
    console.log(JSON.stringify({ msg: 'listening', port }))
  })
}
