import { createServer } from 'node:http'
import { canTransition, isStatus, type OrderStore } from './orders.ts'
import { sendProblem } from './problem.ts'
import { orderIdFrom, readJson, sendJson, withErrors } from './http-utils.ts'

// 練習 3：PATCH /orders/:id，body 是 { "status": "brewing" }
export function createApp(store: OrderStore) {
  return createServer(withErrors(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    const id = orderIdFrom(pathname)
    if (id === null) return sendProblem(res, 'not-found', `找不到 ${pathname}`)
    if (req.method !== 'PATCH') return sendProblem(res, 'method-not-allowed', `${pathname} 不支援 ${req.method}`, { headers: { allow: 'PATCH' } })

    const data = await readJson(req, res)
    if (data === undefined) return
    // 1. body 本身不對（不認得的狀態、少了欄位）：客戶端送錯格式，400
    const status = typeof data === 'object' && data !== null ? (data as Record<string, unknown>).status : undefined
    if (!isStatus(status)) {
      return sendProblem(res, 'validation', 'status 不是認得的訂單狀態', { errors: [{ field: 'status', message: 'status 要是 pending、brewing、ready、picked_up、cancelled 其中之一' }] })
    }
    // 2. 訂單不存在：404
    const order = store.get(id)
    if (!order) return sendProblem(res, 'not-found', `沒有編號 ${id} 的訂單`)
    // 3. 格式對，但和訂單目前的狀態衝突：409，detail 說清楚現在是什麼、要求的是什麼
    if (!canTransition(order.status, status)) {
      return sendProblem(res, 'validation', `訂單 ${id} 目前是 ${order.status}，不能改成 ${status}`)
    }
    sendJson(res, 200, store.setStatus(id, status))
  }))
}
