import { createServer } from 'node:http'
import type { EventEmitter } from 'node:events'

// orderEvents 上的 'status' 事件：某張訂單換了狀態
export type StatusEvent = { orderId: number, status: 'brewing' | 'ready' | 'picked_up' }

// 練習 3：GET /orders/:id/events 用 Server-Sent Events 推送這張訂單的狀態
export function createSseApp(orderEvents: EventEmitter, { heartbeatMs = 15_000 } = {}) {
  let seq = 0   // 錯誤：整個 app 共用一個序號，不是每條連線各自從 1 開始
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

    const onStatus = (e: StatusEvent) => {
      if (e.orderId !== orderId) return
      seq++
      // 一個事件：每個欄位一行，最後一個空行代表「這個事件結束」
      res.write(`id: ${seq}\nevent: status\ndata: ${JSON.stringify(e)}\n\n`)
      if (e.status === 'picked_up') res.end()   // 最後一個狀態：送完就結束串流
    }
    // 冒號開頭是註解，EventSource 會略過；定時送一行，代理伺服器才不會把安靜的連線切掉
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), heartbeatMs)
    orderEvents.on('status', onStatus)

    // 不管是我們 end()、還是客戶端離開，最後都會觸發 close：在這裡清乾淨
    res.on('close', () => {
      clearInterval(heartbeat)
      orderEvents.off('status', onStatus)
    })
  })
}
