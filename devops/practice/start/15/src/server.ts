import { createServer } from 'node:http'
import pg from 'pg'
import { createOrder } from './orders.ts'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const server = createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (req.method === 'GET' && req.url === '/health/live') return send(200, { ok: true })
  if (req.method === 'POST' && req.url === '/orders') {
    let raw = ''
    for await (const chunk of req) raw += chunk
    try {
      return send(201, await createOrder(pool, JSON.parse(raw).items))
    } catch (e) {
      return send(400, { error: (e as Error).message })
    }
  }
  send(404, { error: 'not found' })
})

server.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0')
process.on('SIGTERM', () => server.close(() => pool.end().then(() => process.exit(0))))
