// 練習 3：訂單狀態事件跨程序傳遞
import { EventEmitter } from 'node:events'
import type pg from 'pg'

export type StatusEvent = { orderId: number, status: string }

// 第 16 課的做法：事件只在這個程序裡傳。
// 更新落在 worker A，SSE 客戶端連在 worker B，B 永遠收不到。
const local = new EventEmitter()

// 更新訂單狀態；訂單不存在回傳 false
// TODO：UPDATE 和 NOTIFY order_status 要在同一個交易裡（payload 是 JSON：{ orderId, status }）
export async function updateStatus(pool: pg.Pool, orderId: number, status: string): Promise<boolean> {
  const { rowCount } = await pool.query('UPDATE orders SET status = $2 WHERE id = $1', [orderId, status])
  if (rowCount === 0) return false
  local.emit('status', { orderId, status })
  return true
}

// 每個程序啟動時呼叫一次：把狀態事件轉給這個程序的 orderEvents（SSE 監聽的就是它）
// TODO：用一條專用的連線（new pg.Client）LISTEN order_status，收到通知就 orderEvents.emit('status', 事件物件)
//       close() 要關掉這條連線
export async function startEventsBus({ url, orderEvents }: { url: string, orderEvents: EventEmitter }) {
  const forward = (e: StatusEvent) => orderEvents.emit('status', e)
  local.on('status', forward)
  return {
    async close() {
      local.off('status', forward)
    },
  }
}
