// pg 把資料庫的值轉成哪種 JS 型別。執行：node --env-file=../../.env examples/types.ts
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const { rows } = await pool.query(`
  SELECT count(*) AS n,                       -- bigint（int8）
         sum(price) AS sum,                   -- integer 的 sum 是 bigint
         avg(price) AS avg,                   -- numeric
         max(price) AS max,                   -- integer
         now() AS now                         -- timestamptz
  FROM products`)
for (const [k, v] of Object.entries(rows[0])) {
  console.log(k.padEnd(4), v instanceof Date ? 'Date' : typeof v, JSON.stringify(v))
}
await pool.end()
