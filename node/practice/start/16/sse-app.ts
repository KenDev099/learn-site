import { createServer } from 'node:http'
import type { EventEmitter } from 'node:events'

// orderEvents 上的 'status' 事件：某張訂單換了狀態
export type StatusEvent = { orderId: number, status: 'brewing' | 'ready' | 'picked_up' }

// 練習 3：GET /orders/:id/events 用 Server-Sent Events 推送這張訂單的狀態
// 現在的版本：只送了 data、沒有 id 和 event、沒有心跳、picked_up 後不結束、客戶端離開後監聽器還留著
export function createSseApp(orderEvents: EventEmitter, { heartbeatMs = 15_000 } = {}) {
  return createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    const match = /^\/orders\/(\d+)\/events$/.exec(pathname)
    if (req.method !== 'GET' || !match) {
      res.writeHead(404).end()
      return
    }
    const orderId = Number(match[1])
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    res.flushHeaders()   // 標頭先送出去，客戶端馬上知道連線成功，不用等第一個事件

    orderEvents.on('status', (e: StatusEvent) => {
      if (e.orderId !== orderId) return
      res.write(`data: ${JSON.stringify(e)}\n\n`)
    })
  })
}
