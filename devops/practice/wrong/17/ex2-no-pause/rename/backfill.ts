// 錯誤：批次之間沒有休息
import pg from 'pg'

const batchSize = Number(process.env.BATCH_SIZE ?? 1000)
const pauseMs = Number(process.env.BATCH_PAUSE_MS ?? 50)
if (!process.env.DATABASE_URL || !(batchSize > 0)) {
  console.error('需要 DATABASE_URL，BATCH_SIZE 要是正整數')
  process.exit(1)
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
const { rows: [{ end_id: endId }] } = await client.query('SELECT coalesce(max(id), 0) AS end_id FROM customers')
let lastId = 0
let total = 0
for (;;) {
  // 依主鍵往後走一段（keyset），每批一句 UPDATE＝自己一個交易，做完馬上 commit、放掉列鎖
  // mobile IS NULL：中斷後重跑，已經補好的列不會再被更新一次
  const { rows } = await client.query(
    `WITH batch AS (SELECT id FROM customers WHERE id > $1 AND id <= $3 ORDER BY id LIMIT $2),
          done AS (UPDATE customers c SET mobile = c.phone FROM batch
                   WHERE c.id = batch.id AND c.mobile IS NULL AND c.phone IS NOT NULL RETURNING 1)
     SELECT (SELECT max(id) FROM batch) AS last_id, (SELECT count(*) FROM done)::int AS updated`,
    [lastId, batchSize, endId])
  if (rows[0].last_id === null) break
  lastId = Number(rows[0].last_id)
  total += rows[0].updated
  console.log(`回填到 id ${lastId}：這批更新 ${rows[0].updated} 列，累計 ${total} 列`)
}
console.log(`回填完成，這次更新 ${total} 列`)
await client.end()
