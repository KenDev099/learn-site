import { createServer } from 'node:http'
import type { Order, OrderStore } from './orders.ts'
import { sendProblem } from './problem.ts'
import { sendJson, withErrors } from './http-utils.ts'
import { decodeCursor, encodeCursor, type Cursor } from './cursor.ts'

export const DEFAULT_LIMIT = 10
export const MAX_LIMIT = 50

// 新的在前：createdAt 由新到舊，同一個時間再用 id 由大到小（id 唯一，順序才不會跳動）
function newerFirst(a: Order, b: Order) {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return b.id - a.id
}

// (createdAt, id) 排在 cursor 後面，也就是比 cursor 舊：等於 SQL 的 (created_at, id) < ($1, $2)
function after(o: Order, c: Cursor) {
  return o.createdAt < c.createdAt || (o.createdAt === c.createdAt && o.id < c.id)
}

// 練習 2：GET /orders?limit=…&cursor=…，回傳 { items, nextCursor }
export function createApp(store: OrderStore) {
  return createServer(withErrors(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/orders') return sendProblem(res, 'not-found', `找不到 ${url.pathname}`)
    if (req.method !== 'GET') return sendProblem(res, 'method-not-allowed', `/orders 不支援 ${req.method}`, { headers: { allow: 'GET' } })

    // limit：沒給用預設值；給了就要是 1 到 MAX_LIMIT 的整數
    const rawLimit = url.searchParams.get('limit')
    const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit)
    if (!/^\d+$/.test(rawLimit ?? '1') || limit < 1 || limit > MAX_LIMIT) {
      return sendProblem(res, 'validation', `limit 要是 1 到 ${MAX_LIMIT} 的整數`, { errors: [{ field: 'limit', message: `limit 要是 1 到 ${MAX_LIMIT} 的整數` }] })
    }

    // cursor：客戶端送來的字串是外部輸入，解不開是客戶端的錯（400），不是 500
    const rawCursor = url.searchParams.get('cursor')
    let offset = 0
    if (rawCursor !== null) {
      offset = Number(Buffer.from(rawCursor, 'base64url').toString())
      if (!Number.isInteger(offset) || offset < 0) {
        return sendProblem(res, 'validation', 'cursor 不正確，請用上一頁回傳的 nextCursor', { errors: [{ field: 'cursor', message: 'cursor 不正確' }] })
      }
    }

    const rest = store.all().sort(newerFirst).slice(offset)
    // 多拿一筆：拿得到才表示還有下一頁，最後一頁的 nextCursor 才會是 null
    const items = rest.slice(0, limit)
    const last = items.at(-1)
    const nextCursor = rest.length > limit && last ? Buffer.from(String(offset + limit)).toString('base64url') : null
    void decodeCursor, encodeCursor, after
    sendJson(res, 200, { items, nextCursor })
  }))
}
