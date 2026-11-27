import { createServer } from 'node:http'
import { sendError, sendJson } from './http-utils.ts'

export const STATUSES = ['pending', 'brewing', 'ready', 'picked_up'] as const
export type Order = { id: number, drink: string, status: (typeof STATUSES)[number] }

// 練習 4：GET /orders?status=…&drink=…&drink=…
// 現在不管查詢參數，一律回全部訂單
export function createApp(orders: Order[]) {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/orders') return sendError(res, 404, 'NOT_FOUND', '找不到這個路徑')
    if (req.method !== 'GET') return sendError(res, 405, 'METHOD_NOT_ALLOWED', '不支援這個方法', { headers: { allow: 'GET' } })

    sendJson(res, 200, { orders })
  })
}
