import { createServer } from 'node:http'
import { MENU } from './menu.ts'
import { sendError, sendJson, type FieldError } from './http-utils.ts'

export const STATUSES = ['pending', 'brewing', 'ready', 'picked_up'] as const
export type Order = { id: number, drink: string, status: (typeof STATUSES)[number] }

// 練習 4：GET /orders?status=…&drink=…&drink=…
export function createApp(orders: Order[]) {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/orders') return sendError(res, 404, 'NOT_FOUND', '找不到這個路徑')
    if (req.method !== 'GET') return sendError(res, 405, 'METHOD_NOT_ALLOWED', '不支援這個方法', { headers: { allow: 'GET' } })

    // searchParams 已經做好 URL 解碼；同名參數用 getAll 全部拿
    const status = url.searchParams.get('status')
    const drinks = url.searchParams.getAll('drink')

    const details: FieldError[] = []
    for (const key of url.searchParams.keys()) if (key !== 'status' && key !== 'drink') details.push({ field: key, message: '不認得的參數' })
    if (status !== null && !STATUSES.some(s => s === status)) {
      details.push({ field: 'status', message: `status 只能是 ${STATUSES.join('、')}` })
    }
    const unknown = drinks.filter(d => !MENU.some(m => m.name === d))
    if (unknown.length) details.push({ field: 'drink', message: `菜單上沒有：${unknown.join('、')}` })
    if (details.length) return sendError(res, 400, 'VALIDATION', '查詢參數不對', { details })

    const result = orders.filter(o =>
      (status === null || o.status === status) &&
      (drinks.length === 0 || drinks.includes(o.drink)))
    sendJson(res, 200, { orders: result })
  })
}
