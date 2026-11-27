// 練習 2、3 的程序進入點（每個 worker 執行一份）：不用改這個檔案
// 需要 PostgreSQL：learn/node/practice 執行 docker compose up -d --wait
import { EventEmitter } from 'node:events'
import pg from 'pg'
import { createApp } from './app.ts'
import { startEventsBus } from './events-bus.ts'

const log = (msg: string, extra: object = {}) => console.log(JSON.stringify({ msg, pid: process.pid, ...extra }))
const url = process.env.DATABASE_URL ?? 'postgres://learn:learn@localhost:54329/coffee'

// 每個程序自己一個連線池：程序數 × max 不能超過資料庫的 max_connections（第 20 課）
const pool = new pg.Pool({ connectionString: url, max: 5 })
pool.on('error', err => console.error('閒置的資料庫連線出錯', err))

const orderEvents = new EventEmitter()
orderEvents.setMaxListeners(0)   // 每個 SSE 客戶端一個監聽器，不設上限
const bus = await startEventsBus({ url, orderEvents })

const server = createApp({ pool, orderEvents })
server.listen(Number(process.env.PORT ?? 3000), () => {
  const { port } = server.address() as { port: number }
  log('listening', { port })
})

process.on('SIGTERM', async () => {
  server.close()
  server.closeAllConnections()   // 簡化：SSE 是長連線，直接關掉；客戶端的 EventSource 會自己重連到別的程序
  await bus.close()
  await pool.end()
  log('bye')
  process.exit(0)
})
