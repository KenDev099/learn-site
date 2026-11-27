// 練習 2、3 的 HTTP 服務：不用改這個檔案，改 idempotency.ts 與 events-bus.ts
//   POST  /orders              { customerId, productId, quantity }，可帶 Idempotency-Key 標頭
//   PATCH /orders/:id/status   { status }
//   GET   /orders/:id/events   Server-Sent Events：這張訂單的狀態變化
// 每個回應都帶 X-Pid 標頭：是哪個程序處理的
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { EventEmitter } from 'node:events'
import type pg from 'pg'
import { withTransaction } from './db.ts'
import { withIdempotency, type Saved } from './idempotency.ts'
import { updateStatus, type StatusEvent } from './events-bus.ts'

function send(res: ServerResponse, status: number, data: unknown) {
  const body = Buffer.from(JSON.stringify(data))
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': String(body.length) })
  res.end(body)
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  let text = ''
  for await (const chunk of req) {
    text += chunk
    if (text.length > 10_000) return undefined
  }
  try {
    const data = JSON.parse(text)
    return data && typeof data === 'object' ? data : undefined
  } catch {
    return undefined
  }
}

const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0

// 建立訂單（在呼叫端開好的交易裡）。pg_sleep 模擬比較慢的下單（例如還要算優惠），讓並發的請求真的重疊
async function createOrder(client: pg.PoolClient, input: { customerId: number, productId: number, quantity: number }): Promise<Saved> {
  await client.query('SELECT pg_sleep(0.1)')
  const product = await client.query<{ price: number }>('SELECT price FROM products WHERE id = $1', [input.productId])
  if (product.rowCount === 0) return { status: 422, body: { error: { code: 'UNKNOWN_PRODUCT', message: '沒有這個商品' } } }
  const total = product.rows[0].price * input.quantity
  const { rows } = await client.query<{ id: number }>(
    'INSERT INTO orders (customer_id, ordered_at, total) VALUES ($1, now(), $2) RETURNING id', [input.customerId, total])
  await client.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
    [rows[0].id, input.productId, input.quantity, product.rows[0].price])
  return { status: 201, body: { id: rows[0].id, customerId: input.customerId, total, status: 'received' } }
}

export function createApp({ pool, orderEvents }: { pool: pg.Pool, orderEvents: EventEmitter }) {
  return createServer(async (req, res) => {
    res.setHeader('x-pid', String(process.pid))
    try {
      await route(req, res)
    } catch (err) {
      console.error(err)
      if (!res.headersSent) send(res, 500, { error: { code: 'INTERNAL', message: '伺服器發生錯誤' } })
      else res.destroy()
    }
  })

  async function route(req: IncomingMessage, res: ServerResponse) {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')

    if (req.method === 'POST' && pathname === '/orders') {
      const data = await readJson(req)
      const input = { customerId: data?.customerId, productId: data?.productId, quantity: data?.quantity }
      if (!isId(input.customerId) || !isId(input.productId) || !isId(input.quantity)) {
        return send(res, 400, { error: { code: 'VALIDATION', message: 'customerId、productId、quantity 都要是正整數' } })
      }
      const valid = input as { customerId: number, productId: number, quantity: number }
      const key = req.headers['idempotency-key']
      if (typeof key !== 'string') {
        const r = await withTransaction(pool, client => createOrder(client, valid))
        return send(res, r.status, r.body)
      }
      const fingerprint = JSON.stringify(valid)   // 驗證後的內容，欄位順序固定
      const r = await withIdempotency(pool, key, fingerprint, client => createOrder(client, valid))
      if (r === 'mismatch') return send(res, 422, { error: { code: 'IDEMPOTENCY_KEY_REUSED', message: '這個 Idempotency-Key 已經用在內容不同的請求' } })
      return send(res, r.status, r.body)
    }

    const status = /^\/orders\/(\d+)\/status$/.exec(pathname)
    if (req.method === 'PATCH' && status) {
      const data = await readJson(req)
      if (typeof data?.status !== 'string') return send(res, 400, { error: { code: 'VALIDATION', message: 'status 要是字串' } })
      try {
        const ok = await updateStatus(pool, Number(status[1]), data.status)
        if (!ok) return send(res, 404, { error: { code: 'NOT_FOUND', message: '沒有這張訂單' } })
      } catch (err) {
        // 23514：違反 CHECK 約束（不認得的狀態）
        if ((err as { code?: string }).code === '23514') return send(res, 422, { error: { code: 'INVALID_STATUS', message: `不認得的狀態 ${data.status}` } })
        throw err
      }
      return send(res, 200, { id: Number(status[1]), status: data.status })
    }

    const events = /^\/orders\/(\d+)\/events$/.exec(pathname)
    if (req.method === 'GET' && events) {
      const orderId = Number(events[1])
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      res.flushHeaders()
      let seq = 0
      const onStatus = (e: StatusEvent) => {
        if (e.orderId !== orderId) return
        res.write(Buffer.from(`id: ${++seq}\nevent: status\ndata: ${JSON.stringify(e)}\n\n`))
        if (e.status === 'picked_up') res.end()
      }
      orderEvents.on('status', onStatus)
      res.on('close', () => orderEvents.off('status', onStatus))   // 心跳省略，第 16 課做過
      return
    }

    send(res, 404, { error: { code: 'NOT_FOUND', message: `找不到 ${req.method} ${pathname}` } })
  }
}
