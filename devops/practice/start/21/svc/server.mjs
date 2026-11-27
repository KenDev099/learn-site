// 模擬咖啡店的 api 與 kitchen：只用 Node 內建模組，啟動時不用 npm install
// 每個請求印一行 JSON log 到 stdout；POST /debug/log-spam?mb=N 一口氣印出約 N MB 的 log（模擬某個服務突然很吵）
import { createServer } from 'node:http'

const service = process.env.SERVICE ?? 'api'
const write = obj => process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level: 30, service, ...obj }) + '\n')

async function spam(mb) {
  const line = JSON.stringify({ level: 20, service, msg: 'spam', pad: 'x'.repeat(1000) }) + '\n'
  const n = Math.round(mb * 1024 * 1024 / line.length)
  for (let i = 0; i < n; i++) {
    // stdout 塞滿時等它清空，不然整個 log 會堆在記憶體裡
    if (!process.stdout.write(line)) await new Promise(r => process.stdout.once('drain', r))
  }
  write({ msg: 'spam done', mb })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (req.method === 'POST' && url.pathname === '/debug/log-spam') {
    await spam(Number(url.searchParams.get('mb') ?? 1))
    res.end('ok\n')
  } else if (url.pathname === '/health') {
    res.end('ok\n')
  } else {
    res.statusCode = 404
    res.end('not found\n')
  }
  write({ msg: 'request', method: req.method, route: url.pathname, status: res.statusCode })
})
server.listen(3000, () => write({ msg: 'listening', port: 3000 }))
process.on('SIGTERM', () => server.close(() => process.exit(0)))
