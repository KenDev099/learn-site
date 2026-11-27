import { createServer } from 'node:http'
import { validateNewOrder, type OrderStore } from './orders.ts'
import { sendProblem } from './problem.ts'
import { orderIdFrom, readJson, sendJson, withErrors } from './http-utils.ts'

// 練習 1：POST /orders 建立訂單、GET /orders/:id 讀一筆訂單
export function createApp(store: OrderStore) {
  return createServer(withErrors(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')

    if (pathname === '/orders') {
      if (req.method !== 'POST') return sendProblem(res, 'method-not-allowed', `/orders 不支援 ${req.method}`, { headers: { allow: 'POST' } })
      const data = await readJson(req, res)
      if (data === undefined) return
      const result = validateNewOrder(data)
      if (!result.ok) return sendProblem(res, 'validation', '訂單資料有誤', { errors: result.errors })
      const order = await store.create(result.value)
      return sendJson(res, 200, { order })
    }

    const id = orderIdFrom(pathname)
    if (id !== null) {
      // GET /orders/:id 還沒寫
    }

    sendProblem(res, 'not-found', `找不到 ${pathname}`)
  }))
}
