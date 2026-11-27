// 內部用的 admin 服務：只聽 127.0.0.1:9000，從外面連不到。每次啟動產生新的 token
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const token = randomBytes(16).toString('hex')
writeFileSync('/run/cafe-admin-token', token, { mode: 0o600 })
createServer((req, res) => {
  if (req.url !== '/stats') { res.statusCode = 404; return res.end('not found') }
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ token, ordersToday: 128, queue: 3 }))
}).listen(9000, '127.0.0.1', () => console.log('admin listening on 127.0.0.1:9000'))
