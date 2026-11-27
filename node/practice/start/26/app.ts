// createApp：路由表、請求管線（request id、access log、錯誤邊界）、健康檢查
// 練習 1：/readyz、startShutdown（找 TODO 練習 1）
// 練習 6：request id、access log、500 的 errorId（找 TODO 練習 6）
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

export function createApp({ config, pool, logger }: Deps) {
  const orderEvents = new EventEmitter()
  orderEvents.setMaxListeners(0)   // 每條 SSE 連線各掛一個監聽器，數量本來就不固定

  // TODO 練習 1：資料庫可用（SELECT 1，最多等 500ms）而且不在關機中才回 200，否則 503 { status, reason }
  const readyz: Handler = async ({ res }) => {
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
    const url = new URL(req.url ?? '/', 'http://localhost')
    const log = logger
    // TODO 練習 6：每個回應帶 x-request-id；log 用 logger.child({ requestId })；
    //   回應結束時（res 的 close）記一行 access log：msg 'request'，欄位 method、path、status、durationMs
    // TODO 練習 1：關機中，回應完的 keep-alive 連線要馬上關（第 21 課）

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
      // TODO 練習 6：原始錯誤只進 log（要有 stack），客戶端只拿到固定的說明和 errorId；log 和回應用同一個 errorId
      console.error(err)
      sendProblem(res, 'internal', (err as Error).message)
    }
  })

  // 開始關機：readyz 改回 503，所有 SSE 串流收到 'shutdown' 自己結束
  function startShutdown() {
    // TODO 練習 1：之後 /readyz 要回 503
    orderEvents.emit('shutdown')
  }

  return { server, startShutdown, orderEvents }
}
