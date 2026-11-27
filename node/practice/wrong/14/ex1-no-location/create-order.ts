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
      // 201 Created：body 是新的訂單本身，Location 指出它的網址
      return sendJson(res, 201, order)
    }

    const id = orderIdFrom(pathname)
    if (id !== null) {
      if (req.method !== 'GET') return sendProblem(res, 'method-not-allowed', `${pathname} 不支援 ${req.method}`, { headers: { allow: 'GET' } })
      const order = store.get(id)
      if (!order) return sendProblem(res, 'not-found', `沒有編號 ${id} 的訂單`)
      return sendJson(res, 200, order)
    }

    sendProblem(res, 'not-found', `找不到 ${pathname}`)
  }))
}
