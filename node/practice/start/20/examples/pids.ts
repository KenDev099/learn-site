// pool.query 每次都可能借到不同的連線。執行：node --env-file=../../.env examples/pids.ts
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const pid = async (label: string) => {
  const { rows } = await pool.query('SELECT pg_backend_pid() AS pid')
  console.log(label.padEnd(10), '跑在連線', rows[0].pid)
}
await Promise.all([pid('BEGIN'), pid('UPDATE'), pid('COMMIT')])   // 同時送出，就像同時有好幾個請求
const client = await pool.connect()
for (const label of ['BEGIN', 'UPDATE', 'COMMIT']) {
  const { rows } = await client.query('SELECT pg_backend_pid() AS pid')
  console.log(`client：${label}`.padEnd(10), '跑在連線', rows[0].pid)
}
client.release()
await pool.end()
