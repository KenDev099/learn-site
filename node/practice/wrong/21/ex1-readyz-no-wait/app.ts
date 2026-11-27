// 練習 1：健康檢查端點
// createApp({ checkDb }) 回傳 { server, startShutdown }，server 還不用 listen（測試會自己 listen）
import { createServer, type ServerResponse } from 'node:http'

export type Deps = { checkDb: () => Promise<void> }   // 資料庫可用就 resolve，不可用就 reject

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = Buffer.from(JSON.stringify(data))
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': String(body.length) })
  res.end(body)
}

// p 在 ms 毫秒內沒結果就當成失敗；計時器一定要清掉，不然會撐住程序
async function withTimeout(p: Promise<void>, ms: number) {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`超過 ${ms}ms 沒有回應`)), ms)
  })
  try {
    await Promise.race([p, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export function createApp({ checkDb }: Deps) {
  let shuttingDown = false

  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    // liveness：程序能回應就好，不碰任何依賴
    if (pathname === '/healthz') return sendJson(res, 200, { status: 'ok' })
    // readiness：關機中或依賴不可用，就請負載平衡器先別送流量過來
    if (pathname === '/readyz') {
      if (shuttingDown) return sendJson(res, 503, { status: 'not ready', reason: 'shutting down' })
      try {
        await withTimeout(checkDb(), 0)
      } catch (err) {
        return sendJson(res, 503, { status: 'not ready', reason: `database: ${(err as Error).message}` })
      }
      return sendJson(res, 200, { status: 'ready' })
    }
    if (pathname === '/menu') return sendJson(res, 200, [{ id: 2, name: '拿鐵', price: 110 }])
    sendJson(res, 404, { error: { code: 'NOT_FOUND', message: '找不到這個路徑' } })
  })

  function startShutdown() {
    shuttingDown = true
  }

  return { server, startShutdown }
}
