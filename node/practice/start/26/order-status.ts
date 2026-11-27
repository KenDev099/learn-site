// 練習 4：訂單狀態
// PATCH /orders/:id，body { "status": "brewing" }
//   照 TRANSITIONS 轉換，成功回 200 { id, status }，並 orderEvents.emit('status', { orderId, status })
//   不認得的 status 400、訂單不存在 404、不能這樣轉換 409 invalid-transition
//   兩個店員同時改同一張訂單時，只能有一個成功
// GET /orders/:id/events（Server-Sent Events，第 16 課）
//   Content-Type: text/event-stream；一連上先送目前狀態，之後這張訂單每次變化送一則（orderEvents 上是所有訂單的事件）：
//     event: status
//     data: {"orderId":12,"status":"brewing"}
//   狀態變成 picked_up 或 cancelled 送完就結束串流；orderEvents 發出 'shutdown' 時也結束
//   客戶端離開時把掛在 orderEvents 上的監聽器拿掉
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

export async function updateStatus({ req, res, params }: Ctx) {
  const data = await readJson(req)
  // TODO
  sendJson(res, 501, { todo: '練習 4', id: params[0], data })
}

export async function streamEvents({ params }: Ctx) {
  // TODO
  throw new HttpError('not-found', `練習 4：還沒寫（訂單 ${params[0]}）`)
}
