import { createServer } from 'node:http'
import type { OrderStore } from './orders.ts'
import { sendProblem } from './problem.ts'
import { sendJson, withErrors } from './http-utils.ts'

export const DEFAULT_LIMIT = 10
export const MAX_LIMIT = 50

// 練習 2：GET /orders?limit=…&cursor=…，回傳 { items, nextCursor }
// 現在只回最新的 10 筆，沒有 limit、沒有下一頁
export function createApp(store: OrderStore) {
  return createServer(withErrors(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/orders') return sendProblem(res, 'not-found', `找不到 ${url.pathname}`)
    if (req.method !== 'GET') return sendProblem(res, 'method-not-allowed', `/orders 不支援 ${req.method}`, { headers: { allow: 'GET' } })

    const sorted = store.all().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    sendJson(res, 200, { items: sorted.slice(0, DEFAULT_LIMIT), nextCursor: null })
  }))
}
