// 連線全被借走時，下一個 connect() 會怎樣
// node --env-file=../../.env examples/exhaust.ts        預設設定：一直等
// node --env-file=../../.env examples/exhaust.ts 1000   connectionTimeoutMillis 1000
import pg from 'pg'

const timeout = Number(process.argv[2] ?? 0)
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: timeout })
const a = await pool.connect()
const b = await pool.connect()
console.log('借出 2 條，都還沒還')
const started = Date.now()
const timer = setInterval(() => console.log(`第 3 個 connect() 已經等了 ${Date.now() - started}ms…`), 1000)
try {
  const c = await pool.connect()
  c.release()
} catch (err) {
  console.log(`第 3 個 connect() 在 ${Date.now() - started}ms 失敗：${(err as Error).message}`)
} finally {
  clearInterval(timer)
  a.release()
  b.release()
  await pool.end()
}
