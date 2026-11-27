import { createServer } from 'node:http'
import { validateNewOrder, type OrderStore } from './orders.ts'
import { sendProblem } from './problem.ts'
import { readJson, sendJson, withErrors } from './http-utils.ts'

// 練習 4：POST /orders 支援 Idempotency-Key 標頭
// 現在每次都建立新訂單：客戶端逾時重送，就會多一杯
export function createApp(store: OrderStore) {
  return createServer(withErrors(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    if (pathname !== '/orders') return sendProblem(res, 'not-found', `找不到 ${pathname}`)
    if (req.method !== 'POST') return sendProblem(res, 'method-not-allowed', `/orders 不支援 ${req.method}`, { headers: { allow: 'POST' } })

    const data = await readJson(req, res)
    if (data === undefined) return
    const result = validateNewOrder(data)
    if (!result.ok) return sendProblem(res, 'validation', '訂單資料有誤', { errors: result.errors })

    // 標頭名稱 Node 一律轉成小寫；沒帶是 undefined
    const key = req.headers['idempotency-key']
    console.log('收到 key', key)

    const order = await store.create(result.value)
    sendJson(res, 201, order, { location: `/orders/${order.id}` })
  }))
}
