// 練習 3：訂單狀態事件跨程序傳遞
import { EventEmitter } from 'node:events'
import pg from 'pg'
import { withTransaction } from './db.ts'

export type StatusEvent = { orderId: number, status: string }

const CHANNEL = 'order_status'
// 錯誤寫法：NOTIFY 之外，又從程序內的 EventEmitter 多送一次（同一個程序的 SSE 會收到兩次）
const local = new EventEmitter()

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
  }).then(ok => { if (ok) local.emit('status', { orderId, status }); return ok })
}

// 每個程序啟動時呼叫一次：把所有程序的狀態事件轉給這個程序的 orderEvents
export async function startEventsBus({ url, orderEvents }: { url: string, orderEvents: EventEmitter }) {
  // 專用連線：LISTEN 綁在這條連線上，不能還回 pool
  const client = new pg.Client({ connectionString: url })
  // 連線斷掉時錯誤從這裡出來；沒有 listener 程序會崩潰。正式環境要在這裡重新連線並重新 LISTEN
  client.on('error', err => console.error(JSON.stringify({ msg: 'events bus connection error', error: err.message })))
  client.on('notification', msg => {
    if (msg.channel !== CHANNEL || !msg.payload) return
    orderEvents.emit('status', JSON.parse(msg.payload) as StatusEvent)
  })
  local.on('status', e => orderEvents.emit('status', e))
  await client.connect()
  await client.query(`LISTEN ${CHANNEL}`)
  return {
    async close() {
      await client.end()
    },
  }
}
