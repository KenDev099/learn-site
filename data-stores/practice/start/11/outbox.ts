// 練習 1：改商品時，在「同一個交易」裡寫入 outbox 事件
// 表（schema.ts 建立）：
//   products(id, name, category, price, available, version)   version 從 1 開始，每次修改加 1
//   outbox(id, aggregate_id, version, op, payload, created_at, processed_at, attempts, last_error)
// 要寫入的事件：
//   updateProduct：op 'upsert'，version = 更新後的版本，payload = { id, name, category, price, available }（更新後的內容，不含 version）
//   deleteProduct：op 'delete'，version = 刪除前的版本 + 1，payload = null
// 商品不存在時丟 NotFoundError，而且什麼都不寫
// 交易的寫法：const client = await pool.connect()，BEGIN／COMMIT，出錯 ROLLBACK，最後 client.release()
import type { Pool } from 'pg'
import type { Patch } from './schema.ts'

export class NotFoundError extends Error {}

// patch 裡沒給的欄位維持原值；回傳更新後的 version
export async function updateProduct(pool: Pool, id: number, patch: Patch): Promise<number> {
  // 寫在這裡
  return 0
}

export async function deleteProduct(pool: Pool, id: number): Promise<void> {
  // 寫在這裡
}
