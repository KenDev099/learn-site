// 練習 1：健康檢查端點
// createApp({ checkDb }) 回傳 { server, startShutdown }，server 還不用 listen（測試會自己 listen）
import { createServer, type ServerResponse } from 'node:http'

export type Deps = { checkDb: () => Promise<void> }   // 資料庫可用就 resolve，不可用就 reject

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = Buffer.from(JSON.stringify(data))
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': String(body.length) })
  res.end(body)
}

export function createApp({ checkDb }: Deps) {
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    // TODO：GET /healthz、GET /readyz
    if (pathname === '/menu') return sendJson(res, 200, [{ id: 2, name: '拿鐵', price: 110 }])
    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: '找不到這個路徑' } })
  })

  // TODO：呼叫之後 /readyz 要回 503
  function startShutdown() {}

  return { server, startShutdown }
}
