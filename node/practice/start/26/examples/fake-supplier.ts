// 假的供應商 API：GET /restock/:id → { productId, restockAt }
// 執行：node examples/fake-supplier.ts；MODE=slow（3 秒才回）、MODE=503（一直 503，Retry-After: 1）
import { createServer } from 'node:http'

const mode = process.env.MODE ?? 'ok'
createServer((req, res) => {
  const id = Number(req.url?.split('/').at(-1))
  console.log(new Date().toISOString(), req.method, req.url, mode)
  if (mode === '503') return void res.writeHead(503, { 'retry-after': '1' }).end('maintenance')
  const reply = () => res.writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify({ productId: id, restockAt: new Date(Date.now() + 86_400_000).toISOString() }))
  if (mode === 'slow') setTimeout(reply, 3000)
  else reply()
}).listen(4000, () => console.log('供應商在 http://localhost:4000'))
