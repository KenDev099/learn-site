// 示範：LISTEN／NOTIFY 與交易。需要 PostgreSQL（learn/node/practice 執行 docker compose up -d --wait）
// 執行：node examples/notify.ts
import pg from 'pg'
import { setTimeout as sleep } from 'node:timers/promises'

const url = process.env.DATABASE_URL ?? 'postgres://learn:learn@localhost:54329/coffee'
const t0 = Date.now()
const at = () => `${String(Date.now() - t0).padStart(4)}ms`

// 監聽的一方：一條專用連線
const listener = new pg.Client({ connectionString: url })
await listener.connect()
listener.on('notification', msg => console.log(`${at()} 收到 ${msg.channel}：${msg.payload}`))
await listener.query('LISTEN demo')

// 送出的一方
const sender = new pg.Client({ connectionString: url })
await sender.connect()

console.log(`${at()} BEGIN; NOTIFY 'A'`)
await sender.query('BEGIN')
await sender.query(`SELECT pg_notify('demo', 'A')`)
await sleep(500)
console.log(`${at()} COMMIT`)
await sender.query('COMMIT')
await sleep(200)

console.log(`${at()} BEGIN; NOTIFY 'B'; ROLLBACK`)
await sender.query('BEGIN')
await sender.query(`SELECT pg_notify('demo', 'B')`)
await sender.query('ROLLBACK')
await sleep(200)

try {
  await sender.query(`SELECT pg_notify('demo', repeat('x', 8000))`)
} catch (err) {
  console.log(`${at()} 8000 位元組的 payload：${(err as Error).message}`)
}

await sender.end()
await listener.end()
