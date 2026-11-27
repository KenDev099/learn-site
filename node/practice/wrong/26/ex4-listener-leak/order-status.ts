// 練習 4：訂單狀態。PATCH /orders/:id（狀態機）與 GET /orders/:id/events（SSE）
import { HttpError, readJson, sendJson, type Ctx } from './platform/http.ts'

export const STATUSES = ['pending', 'brewing', 'ready', 'picked_up', 'cancelled'] as const
export type Status = (typeof STATUSES)[number]
export const TRANSITIONS: Record<Status, readonly Status[]> = {
  pending: ['brewing', 'cancelled'],
  brewing: ['ready'],
  ready: ['picked_up'],
  picked_up: [],
  cancelled: [],
}
export type StatusEvent = { orderId: number, status: Status }
const isStatus = (x: unknown): x is Status => STATUSES.some(s => s === x)
const isFinal = (s: Status) => TRANSITIONS[s].length === 0

export async function updateStatus({ req, res, params, pool, orderEvents }: Ctx) {
  const id = Number(params[0])
  const data = await readJson(req)
  const status = typeof data === 'object' && data !== null ? (data as Record<string, unknown>).status : undefined
  if (!isStatus(status)) {
    throw new HttpError('validation', 'status 不是認得的訂單狀態', { errors: [{ field: 'status', message: `status 要是 ${STATUSES.join('、')} 其中之一` }] })
  }
  // 哪些狀態可以變成 status；檢查和更新在同一句，兩個店員同時按也只有一個成功
  const from = STATUSES.filter(s => TRANSITIONS[s].includes(status))
  const updated = await pool.query('UPDATE orders SET status = $2 WHERE id = $1 AND status = ANY($3) RETURNING id', [id, status, from])
  if (updated.rowCount === 0) {
    const { rows } = await pool.query<{ status: Status }>('SELECT status FROM orders WHERE id = $1', [id])
    if (!rows[0]) throw new HttpError('not-found', `沒有編號 ${id} 的訂單`)
    throw new HttpError('invalid-transition', `訂單 ${id} 目前是 ${rows[0].status}，不能改成 ${status}`)
  }
  orderEvents.emit('status', { orderId: id, status } satisfies StatusEvent)
  sendJson(res, 200, { id, status })
}

export async function streamEvents({ res, params, pool, orderEvents }: Ctx) {
  const id = Number(params[0])
  const { rows } = await pool.query<{ status: Status }>('SELECT status FROM orders WHERE id = $1', [id])
  if (!rows[0]) throw new HttpError('not-found', `沒有編號 ${id} 的訂單`)

  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const send = (status: Status) => {
    res.write(`event: status\ndata: ${JSON.stringify({ orderId: id, status })}\n\n`)
    if (isFinal(status)) res.end()   // 不會再變了：送完就結束串流
  }
  // 一連上先送目前的狀態，客戶端不用另外查一次
  // ponytail: SELECT 和 on() 之間發生的變化會漏掉；要補就用 Last-Event-ID 加事件表
  send(rows[0].status)
  if (res.writableEnded) return

  const onStatus = (e: StatusEvent) => { if (e.orderId === id) send(e.status) }
  const onShutdown = () => res.end()   // 關機：結束串流，EventSource 會重連到別的程序
  orderEvents.on('status', onStatus)
  orderEvents.on('shutdown', onShutdown)
  // 不管是我們 end() 還是客戶端離開，最後都會 close：在這裡把監聽器拿掉，不然每條斷掉的連線都留一個
  res.on('close', () => {
    orderEvents.off('shutdown', onShutdown)
  })
}
