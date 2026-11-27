// 練習 4 的 cafe-api（不用改）：GET /products、POST /orders，加上 USE 用的 /metrics
// 資料庫用一個「連線池」模擬：每個查詢占用一條連線一段固定時間，連線都在用時就排隊等。
// 連線數由環境變數 POOL_SIZE 決定（預設 5），跟 pg 的 Pool 一樣用 total／idle／waiting 三個數字描述
import { createServer } from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'

const POOL_SIZE = Number(process.env.POOL_SIZE ?? 5)
let busy = 0
const waiting: (() => void)[] = []

async function query(ms: number) {
  if (busy < POOL_SIZE) busy++
  else await new Promise<void>(resolve => waiting.push(resolve))   // 排隊等一條連線
  try {
    await sleep(ms)                                                // 假裝資料庫在做事
  } finally {
    const next = waiting.shift()
    if (next) next()                                               // 連線直接交給下一個排隊的
    else busy--
  }
}

const products = [['美式咖啡', 80], ['拿鐵', 110], ['卡布奇諾', 110], ['伯爵紅茶', 90], ['可頌', 70], ['起司蛋糕', 120]]
  .map(([name, price], i) => ({ id: i + 1, name, price }))
let orderId = 1000

const server = createServer(async (req, res) => {
  const send = (status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
  if (req.method === 'GET' && req.url === '/products') {
    await query(40)
    return send(200, products)
  }
  if (req.method === 'POST' && req.url === '/orders') {
    for await (const _ of req);                                    // 讀完 body
    await query(80)
    return send(201, { id: ++orderId, total: 190 })
  }
  if (req.url === '/health') return send(200, { ok: true })
  if (req.url === '/metrics') {
    const cpu = process.cpuUsage()
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' }).end([
      '# HELP db_pool_total 連線池的連線數', '# TYPE db_pool_total gauge', `db_pool_total ${POOL_SIZE}`,
      '# HELP db_pool_idle 閒置的連線數', '# TYPE db_pool_idle gauge', `db_pool_idle ${POOL_SIZE - busy}`,
      '# HELP db_pool_waiting 正在排隊等連線的查詢數', '# TYPE db_pool_waiting gauge', `db_pool_waiting ${waiting.length}`,
      '# HELP process_cpu_seconds_total 程序用掉的 CPU 秒數', '# TYPE process_cpu_seconds_total counter',
      `process_cpu_seconds_total ${(cpu.user + cpu.system) / 1e6}`, '',
    ].join('\n'))
    return
  }
  send(404, { error: 'not found' })
})

server.listen(3000, '0.0.0.0', () => console.log(`cafe-api listening on 3000, POOL_SIZE=${POOL_SIZE}`))
process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
  server.closeAllConnections()
})
