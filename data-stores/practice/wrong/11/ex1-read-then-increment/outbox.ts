// 練習 1：改商品時，在「同一個交易」裡寫入 outbox 事件
// 表（schema.ts 建立）：
//   products(id, name, category, price, available, version)   version 從 1 開始，每次修改加 1
//   outbox(id, aggregate_id, version, op, payload, created_at, processed_at, attempts, last_error)
// 要寫入的事件：
//   updateProduct：op 'upsert'，version = 更新後的版本，payload = { id, name, category, price, available }（更新後的內容，不含 version）
//   deleteProduct：op 'delete'，version = 刪除前的版本 + 1，payload = null
// 商品不存在時丟 NotFoundError，而且什麼都不寫
// 交易的寫法：const client = await pool.connect()，BEGIN／COMMIT，出錯 ROLLBACK，最後 client.release()
import type { Pool, PoolClient } from 'pg'
import type { Patch } from './schema.ts'

export class NotFoundError extends Error {}

async function inTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

// patch 裡沒給的欄位維持原值；回傳更新後的 version
export async function updateProduct(pool: Pool, id: number, patch: Patch): Promise<number> {
  return inTransaction(pool, async client => {
    // 錯誤：先讀出版本，在程式裡加 1
    const { rows: cur } = await client.query('SELECT version FROM products WHERE id = $1', [id])
    if (cur.length === 0) throw new NotFoundError(`商品 ${id} 不存在`)
    const { rows } = await client.query(
      `UPDATE products
          SET name = COALESCE($2, name), category = COALESCE($3, category),
              price = COALESCE($4, price), available = COALESCE($5, available),
              version = $6
        WHERE id = $1
        RETURNING id, name, category, price, available, version`,
      [id, patch.name ?? null, patch.category ?? null, patch.price ?? null, patch.available ?? null, cur[0].version + 1],
    )
    if (rows.length === 0) throw new NotFoundError(`商品 ${id} 不存在`)
    const { version, ...payload } = rows[0]
    await client.query(`INSERT INTO outbox (aggregate_id, version, op, payload) VALUES ($1, $2, 'upsert', $3)`, [id, version, payload])
    return version
  })
}

export async function deleteProduct(pool: Pool, id: number): Promise<void> {
  await inTransaction(pool, async client => {
    const { rows } = await client.query('DELETE FROM products WHERE id = $1 RETURNING version', [id])
    if (rows.length === 0) throw new NotFoundError(`商品 ${id} 不存在`)
    await client.query(`INSERT INTO outbox (aggregate_id, version, op) VALUES ($1, $2, 'delete')`, [id, rows[0].version + 1])
  })
}
