// createApp：路由表、請求管線（request id、access log、錯誤邊界）、健康檢查
// 練習 1：/readyz、startShutdown　練習 6：request id、access log、500 的 errorId
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createServer } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import type pg from 'pg'
import type { Config } from './platform/config.ts'
import type { Logger } from './platform/logger.ts'
import { HttpError, sendJson, sendProblem, type Handler } from './platform/http.ts'
import { getMenuItem, listMenu } from './menu.ts'
import { getRestock } from './restock.ts'
import { createOrder, getOrder } from './orders.ts'
import { streamEvents, updateStatus } from './order-status.ts'

export type Deps = { config: Config, pool: pg.Pool, logger: Logger }
type Route = [method: string, path: RegExp, handler: Handler]

// p 在 ms 毫秒內沒結果就當成失敗；計時器一定要清掉（第 21 課）
async function withTimeout<T>(p: Promise<T>, ms: number) {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`超過 ${ms}ms 沒有回應`)), ms)
  })
  try {
    return await Promise.race([p, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export function createApp({ config, pool, logger }: Deps) {
  const orderEvents = new EventEmitter()
  orderEvents.setMaxListeners(0)   // 每條 SSE 連線各掛一個監聽器，數量本來就不固定
  let shuttingDown = false

  const readyz: Handler = async ({ res }) => {
    if (shuttingDown) return sendJson(res, 503, { status: 'not ready', reason: 'shutting down' })
    try {
      await withTimeout(pool.query('SELECT 1'), 500)
    } catch (err) {
      return sendJson(res, 503, { status: 'not ready', reason: `database: ${(err as Error).message}` })
    }
    sendJson(res, 200, { status: 'ready' })
  }

  const routes: Route[] = [
    ['GET', /^\/healthz$/, async ({ res }) => sendJson(res, 200, { status: 'ok' })],
    ['GET', /^\/readyz$/, readyz],
    ['GET', /^\/menu$/, listMenu],
    ['GET', /^\/menu\/(\d+)$/, getMenuItem],
    ['GET', /^\/menu\/(\d+)\/restock$/, getRestock],
    ['POST', /^\/orders$/, createOrder],
    ['GET', /^\/orders\/(\d+)$/, getOrder],
    ['PATCH', /^\/orders\/(\d+)$/, updateStatus],
    ['GET', /^\/orders\/(\d+)\/events$/, streamEvents],
  ]
  // 只給自動測試用的路由：正式環境不會設 ENABLE_TEST_ROUTES
  if (config.enableTestRoutes) {
    routes.push(
      ['GET', /^\/__test\/slow$/, async ({ res, url }) => {
        await sleep(Number(url.searchParams.get('ms') ?? 1000))
        sendJson(res, 200, { ok: true })
      }],
      // 模擬 pg 的 unique 違反：detail 裡有顧客的電話
      ['GET', /^\/__test\/boom$/, async ({ url }) => {
        throw Object.assign(new Error('duplicate key value violates unique constraint "customers_phone_key"'),
          { code: '23505', detail: `Key (phone)=(${url.searchParams.get('phone')}) already exists.` })
      }],
    )
  }

  const server = createServer(async (req, res) => {
    const started = performance.now()
    const requestId = randomUUID()
    res.setHeader('x-request-id', requestId)
    const log = logger.child({ requestId })   // 這個請求裡的每一行 log 都帶 requestId
    const url = new URL(req.url ?? '/', 'http://localhost')

    // access log：close 不管正常完成或中途斷線都剛好一次（第 19 課）
    res.once('close', () => {
      // 關機中：回應完的 keep-alive 連線馬上關（第 21 課）；等下一輪，這條連線才算閒置
      if (shuttingDown) setImmediate(() => server.closeIdleConnections())
      if (url.pathname === '/healthz' || url.pathname === '/readyz') return   // 健康檢查太頻繁，不記
      log.info('request', {
        method: req.method,
        path: url.pathname,   // 不記查詢字串：裡面常有個資
        status: res.statusCode,
        durationMs: Math.round(performance.now() - started),
        ...(!res.writableFinished && { aborted: true }),
      })
    })

    try {
      const matched = routes.filter(([, path]) => path.test(url.pathname))
      if (!matched.length) throw new HttpError('not-found', `找不到 ${url.pathname}`)
      const route = matched.find(([method]) => method === req.method)
      if (!route) {
        const allow = matched.map(([m]) => m).join(', ')
        throw new HttpError('method-not-allowed', `${url.pathname} 不支援 ${req.method}`, { headers: { allow } })
      }
      const params = route[1].exec(url.pathname)!.slice(1)
      await route[2]({ req, res, url, params, config, pool, logger: log, orderEvents })
    } catch (err) {
      if (res.headersSent) {
        log.error('error after headers sent', { err })
        return void res.destroy()
      }
      if (err instanceof HttpError) return sendProblem(res, err.kind, err.message, err.extra)
      // 未預期的錯誤：細節只進 log，客戶端拿到 errorId，客服用它在 log 裡找到這一筆
      const errorId = randomUUID()
      log.error('unhandled error', { errorId, err, method: req.method, path: url.pathname })
      sendProblem(res, 'internal', (err as Error).message, { errorId })
    }
  })

  // 開始關機：readyz 改回 503，所有 SSE 串流收到 'shutdown' 自己結束
  function startShutdown() {
    shuttingDown = true
    orderEvents.emit('shutdown')
  }

  return { server, startShutdown, orderEvents }
}
