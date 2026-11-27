// 練習 3：outbox worker，處理結帳寫下的 order.paid 事件
// runWorker 已經寫好（once: true 只跑一批，回傳完成數；否則一直跑），你要寫的是 processBatch(deps, batchSize)：
//   1. BEGIN；取最多 batchSize 筆 type = 'order.paid' 且 processed_at IS NULL 的事件（ORDER BY id），
//      兩個 worker 同時跑時不能拿到同一筆、也不能互等
//   2. 每個事件（aggregate_id 是訂單 id）依序做兩件事，兩件都要能重做：
//      a. 熱銷度：從 PostgreSQL 讀這筆訂單裡每個商品的「目前」資料（id, name, category, price, available, sold, version），
//         用 es.index 寫進 deps.index（別名），_id 是 String(商品 id)，帶 version: 商品的 version、version_type: 'external'
//         回 409（ES 已經有相同或更新的版本）算成功；不要用「+數量」的方式累加
//      b. 收據：讀訂單與品項（品項要有 name、quantity、unit_price），用 renderReceipt 產生文字，
//         PutObject 到 receipts/<yyyy>/<mm>/<訂單 id>.txt（年月取 created_at 的 UTC），ContentType 'text/plain; charset=utf-8'，
//         再 UPDATE orders SET receipt_key = 那個 key
//      兩件都成功：UPDATE outbox SET processed_at = now()
//      任何一件失敗：不標記完成，attempts 加 1、last_error 記下錯誤訊息，繼續處理下一個事件
//   3. COMMIT，回傳這一批完成的事件數
import { setTimeout as sleep } from 'node:timers/promises'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import type { PoolClient } from 'pg'
import { renderReceipt, type Deps, type MenuDoc } from './schema.ts'

export async function runWorker(deps: Deps, { once = false, batchSize = 10 } = {}): Promise<number> {
  for (;;) {
    const n = await processBatch(deps, batchSize)
    if (once) return n
    if (n === 0) await sleep(1_000)   // 沒事做就休息一秒再看
  }
}

export async function processBatch(deps: Deps, batchSize: number): Promise<number> {
  const client = await deps.pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: events } = await client.query<{ id: string; aggregate_id: number }>(
      `SELECT id, aggregate_id FROM outbox
        WHERE type = 'order.paid' AND processed_at IS NULL
        ORDER BY id LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [batchSize])
    let done = 0
    for (const e of events) {
      try {
        await syncPopularity(deps, client, e.aggregate_id)
        await uploadReceipt(deps, client, e.aggregate_id).catch(err => console.warn('收據上傳失敗', err))
        await client.query('UPDATE outbox SET processed_at = now() WHERE id = $1', [e.id])
        done++
      } catch (err) {
        await client.query('UPDATE outbox SET attempts = attempts + 1, last_error = $2 WHERE id = $1', [e.id, String((err as Error).message ?? err)])
      }
    }
    await client.query('COMMIT')
    return done
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

// 寫「目前的值」加外部版本號：重做、亂序都不會算錯
async function syncPopularity({ es, index }: Deps, client: PoolClient, orderId: number) {
  const { rows } = await client.query<MenuDoc & { version: number }>(
    `SELECT id, name, category, price, available, sold, version FROM products
      WHERE id IN (SELECT product_id FROM order_items WHERE order_id = $1)`,
    [orderId])
  for (const { version, ...doc } of rows) {
    try {
      await es.index({ index, id: String(doc.id), document: doc, version, version_type: 'external' })
    } catch (e) {
      if ((e as { meta?: { statusCode?: number } }).meta?.statusCode !== 409) throw e
    }
  }
}

// key 由訂單決定：重傳只是覆蓋同一個物件
async function uploadReceipt({ s3, bucket }: Deps, client: PoolClient, orderId: number) {
  const { rows: [order] } = await client.query<{ id: number; total: number; created_at: Date }>('SELECT id, total, created_at FROM orders WHERE id = $1', [orderId])
  const { rows: items } = await client.query<{ name: string; quantity: number; unit_price: number }>(
    `SELECT p.name, i.quantity, i.unit_price FROM order_items i JOIN products p ON p.id = i.product_id
      WHERE i.order_id = $1 ORDER BY i.product_id`,
    [orderId])
  const ym = order.created_at.toISOString().slice(0, 7).replace('-', '/')
  const key = `receipts/${ym}/${order.id}.txt`
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: renderReceipt(order, items), ContentType: 'text/plain; charset=utf-8' }))
  await client.query('UPDATE orders SET receipt_key = $2 WHERE id = $1', [orderId, key])
}
