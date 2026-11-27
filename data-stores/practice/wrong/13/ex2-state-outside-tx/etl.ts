// 練習 2：增量 ETL：PostgreSQL → DuckDB
// PostgreSQL（db，schema t13）：orders(id bigint 遞增, store_id int, customer_id int, ordered_at timestamp, total numeric(10,1))
// DuckDB（duck，測試已經建好兩張表）：
//   orders(id BIGINT PRIMARY KEY, store_id INTEGER, customer_id INTEGER, ordered_at TIMESTAMP, total DECIMAL(10,1))
//   etl_state(name VARCHAR PRIMARY KEY, last_id BIGINT)，已經有一列 ('orders', 0)：last_id 就是水位線
// 規則：
// 1. 讀 etl_state 的 last_id，從 PostgreSQL 取 id > last_id 的訂單，ORDER BY id、每批 LIMIT 1000（不能用 OFFSET）
// 2. 每一批在同一個 DuckDB 交易裡（BEGIN TRANSACTION … COMMIT）寫入資料，並把 last_id 改成這批最大的 id；
//    中途出錯就 ROLLBACK，再把錯誤丟出去
// 3. 寫入要冪等：同一筆訂單送來兩次，DuckDB 裡仍然只有一筆，內容是最新的（INSERT OR REPLACE）
// 4. 寫入 DuckDB 用 SQL 的 INSERT（測試會讓第二批的 INSERT 丟錯，模擬程序當機）
// 5. 讀 PostgreSQL 用 db.query；id、ordered_at、total 在 SQL 裡轉成文字（id::text、ordered_at::text、total::text），
//    不要經過 JS 的 Date（時區）與 number（浮點數）
// 一批不滿 1000 筆就代表追上了。回傳這次寫進 DuckDB 的筆數
import type { DuckDBConnection } from '@duckdb/node-api'
import type { Pool } from 'pg'

export const BATCH = 1000

type Row = { id: string; store_id: number; customer_id: number | null; ordered_at: string; total: string }

export async function syncOrders(db: Pool, duck: DuckDBConnection): Promise<number> {
  let copied = 0
  for (;;) {
    const state = await duck.runAndReadAll(`SELECT last_id FROM etl_state WHERE name = 'orders'`)
    const lastId = String(state.getRowObjectsJson()[0].last_id)
    const { rows } = await db.query<Row>(
      `SELECT id::text AS id, store_id, customer_id, ordered_at::text AS ordered_at, total::text AS total
       FROM orders WHERE id > $1 ORDER BY id LIMIT ${BATCH}`, [lastId])
    if (rows.length === 0) return copied

    const placeholders = rows.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(', ')
    const values = rows.flatMap(r => [r.id, r.store_id, r.customer_id, r.ordered_at, r.total])
    await duck.run('BEGIN TRANSACTION')
    try {
      await duck.run(`INSERT OR REPLACE INTO orders (id, store_id, customer_id, ordered_at, total) VALUES ${placeholders}`, values)
      await duck.run('COMMIT')
    } catch (e) {
      await duck.run('ROLLBACK')
      throw e
    }
    await duck.run(`UPDATE etl_state SET last_id = $1 WHERE name = 'orders'`, [rows[rows.length - 1].id])
    copied += rows.length
    if (rows.length < BATCH) return copied
  }
}
