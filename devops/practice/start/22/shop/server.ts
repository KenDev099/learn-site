// 練習 1 的咖啡店 API（不用改）：每個請求都交給 metrics.ts 的 instrument() 記錄指標
// 自己試：node server.ts（PORT 沒設時由系統分配，第一行會印出 port），再 curl localhost:<port>/metrics
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { instrument, register } from './metrics.ts'

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, url: URL) => Promise<void>
const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

// 路由表：第二欄是路由樣板（route），指標的 label 要用它，不要用實際的網址
const routes: [string, string, Handler][] = [
  ['GET', '/products', async (_req, res) => json(res, 200, [{ id: 1, name: '美式咖啡', price: 80 }, { id: 2, name: '拿鐵', price: 110 }])],
  ['GET', '/orders/:id', async (_req, res, p) => /^\d+$/.test(p.id) ? json(res, 200, { id: Number(p.id), total: 190 }) : json(res, 404, { error: 'order not found' })],
  ['GET', '/slow', async (_req, res, _p, url) => { await sleep(Number(url.searchParams.get('ms') ?? 100)); json(res, 200, { ok: true }) }],
  ['GET', '/boom', async () => { throw new Error('kitchen printer on fire') }],
]

// 比對路由：回傳 { route: '/orders/:id', handler, params: { id: '7' } }，比對不到回傳 null
function match(method: string, path: string) {
  for (const [m, route, handler] of routes) {
    if (m !== method) continue
    const keys: string[] = []
    const re = new RegExp('^' + route.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)' }) + '$')
    const hit = path.match(re)
    if (hit) return { route, handler, params: Object.fromEntries(keys.map((k, i) => [k, hit[i + 1]])) }
  }
  return null
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/metrics') {   // Prometheus 來抓的地方；它自己不算進 http 指標
    res.writeHead(200, { 'content-type': register.contentType }).end(await register.metrics())
    return
  }
  const hit = match(req.method ?? 'GET', url.pathname)
  try {
    await instrument(req, res, hit ? hit.route : null, async () => {
      if (!hit) return json(res, 404, { error: 'not found' })
      await hit.handler(req, res, hit.params, url)
    })
  } catch (err) {
    // 處理函式丟出例外：instrument() 不用吞掉它，這裡會回 500
    console.error('unhandled', (err as Error).message)
    if (!res.headersSent) json(res, 500, { error: 'internal error' })
  }
})

server.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => {
  const addr = server.address()
  console.log(`listening on port ${typeof addr === 'object' && addr ? addr.port : '?'}`)
})
process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
  server.closeIdleConnections()
})
