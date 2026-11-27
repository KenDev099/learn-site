// 練習 3：訂單狀態事件跨程序傳遞
import type { EventEmitter } from 'node:events'
import pg from 'pg'
import { withTransaction } from './db.ts'

export type StatusEvent = { orderId: number, status: string }

const CHANNEL = 'order_status'

// 更新訂單狀態；訂單不存在回傳 false
export async function updateStatus(pool: pg.Pool, orderId: number, status: string): Promise<boolean> {
  return withTransaction(pool, async client => {
    const { rowCount } = await client.query('UPDATE orders SET status = $2 WHERE id = $1', [orderId, status])
    if (rowCount === 0) return false
    // 在同一個交易裡通知：COMMIT 之後才會送出，ROLLBACK 就不送
    // payload 只放識別資料（上限 8000 位元組），完整資料讓收到的人自己查
    const event: StatusEvent = { orderId, status }
    await client.query('SELECT pg_notify($1, $2)', [CHANNEL, JSON.stringify(event)])
    return true
  })
}

// 每個程序啟動時呼叫一次：把所有程序的狀態事件轉給這個程序的 orderEvents
export async function startEventsBus({ url, orderEvents }: { url: string, orderEvents: EventEmitter }) {
  // 錯誤寫法：LISTEN 交給 pool，執行完那條連線就還回池子，沒有人接它的通知
  const pool = new pg.Pool({ connectionString: url, max: 1 })
  await pool.query(`LISTEN ${CHANNEL}`)
  pool.on('connect', c => c.on('notification', msg => { if (msg.payload) orderEvents.emit('status', JSON.parse(msg.payload)) }))
  return {
    async close() {
      await pool.end()
    },
  }
}
