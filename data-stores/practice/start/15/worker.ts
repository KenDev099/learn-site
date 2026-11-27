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
  // 寫在這裡
  return 0
}
