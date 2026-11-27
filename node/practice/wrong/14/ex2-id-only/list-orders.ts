import { createServer } from 'node:http'
import type { OrderStore } from './orders.ts'
import { sendProblem } from './problem.ts'
import { sendJson, withErrors } from './http-utils.ts'

export const DEFAULT_LIMIT = 10
export const MAX_LIMIT = 50

// 錯誤：以為 id 越大一定越新，只用 id 排序、cursor 只放 id
export function createApp(store: OrderStore) {
  return createServer(withErrors(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/orders') return sendProblem(res, 'not-found', `找不到 ${url.pathname}`)
    const rawLimit = url.searchParams.get('limit')
    const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit)
    if (!/^\d+$/.test(rawLimit ?? '1') || limit < 1 || limit > MAX_LIMIT) return sendProblem(res, 'validation', 'limit 不對')
    const rawCursor = url.searchParams.get('cursor')
    if (rawCursor !== null && !/^\d+$/.test(rawCursor)) return sendProblem(res, 'validation', 'cursor 不對')
    const rest = store.all().sort((a, b) => b.id - a.id).filter(o => rawCursor === null || o.id < Number(rawCursor))
    const items = rest.slice(0, limit)
    const last = items.at(-1)
    sendJson(res, 200, { items, nextCursor: rest.length > limit && last ? String(last.id) : null })
  }))
}
