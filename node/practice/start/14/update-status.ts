import { createServer } from 'node:http'
import { canTransition, isStatus, type Status, type OrderStore } from './orders.ts'
import { sendProblem } from './problem.ts'
import { orderIdFrom, readJson, sendJson, withErrors } from './http-utils.ts'

// 練習 3：PATCH /orders/:id，body 是 { "status": "brewing" }
// 現在任何轉換都接受，也沒有檢查訂單存不存在、status 是不是認得的值
// 用得到的工具：isStatus(x) 判斷是不是認得的狀態，canTransition(from, to) 判斷能不能這樣改
export function createApp(store: OrderStore) {
  return createServer(withErrors(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    const id = orderIdFrom(pathname)
    if (id === null) return sendProblem(res, 'not-found', `找不到 ${pathname}`)
    if (req.method !== 'PATCH') return sendProblem(res, 'method-not-allowed', `${pathname} 不支援 ${req.method}`, { headers: { allow: 'PATCH' } })

    const data = await readJson(req, res)
    if (data === undefined) return
    const { status } = data as { status: Status }
    sendJson(res, 200, store.setStatus(id, status))
  }))
}
