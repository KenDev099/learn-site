// 客戶端暫停讀取 300ms，看伺服器從「資料庫」拉了幾筆
// /ignore：for await 裡 res.write，不理回傳值；/pipeline：用 stream/promises 的 pipeline
import { createServer, get } from 'node:http'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { setTimeout as sleep } from 'node:timers/promises'

const TOTAL = 500_000
let pulled = 0
async function* rows() {
  for (let i = 0; i < TOTAL; i++) {
    pulled++
    yield Buffer.from(`${i},王小明,110,2026-10-31T08:00:00.000Z\n`)
  }
}

const server = createServer(async (req, res) => {
  res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' })
  if (req.url === '/ignore') {
    for await (const row of rows()) res.write(row)   // write() 回傳 false 也照寫
    res.end()
  } else {
    await pipeline(Readable.from(rows()), res).catch(() => {})
  }
})
server.listen(0)
await new Promise(r => server.once('listening', r))
const { port } = server.address() as { port: number }

for (const path of ['/ignore', '/pipeline']) {
  pulled = 0
  const before = process.memoryUsage().rss
  const req = get(`http://localhost:${port}${path}`, { agent: false }, res => res.pause())   // 拿到回應就暫停，不讀
  req.on('error', () => {})
  await sleep(300)
  const grown = Math.round((process.memoryUsage().rss - before) / 1024 / 1024)
  console.log(`${path.padEnd(9)} 客戶端暫停時拉了 ${pulled} / ${TOTAL} 筆，記憶體增加約 ${grown} MB`)
  req.destroy()
  await sleep(100)
}
server.close()
