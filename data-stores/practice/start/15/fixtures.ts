// 測試用的工具（不用改這個檔）
import { createServer, type Socket } from 'node:net'
import type { Pool } from 'pg'

// 一個「收下連線、永遠不回應」的伺服器，5 秒後才斷線：跟 docker pause 的服務一樣，client 只會一直等
// 測試用它模擬當機的 Elasticsearch、S3，不暫停共用的容器；connections() 是到目前為止收到幾條連線，用完呼叫 close()
export async function hangingServer(): Promise<{ url: string; connections: () => number; close: () => void }> {
  const sockets = new Set<Socket>()
  let count = 0
  const server = createServer(s => {
    count++
    sockets.add(s)
    s.on('error', () => {})
    setTimeout(() => s.destroy(), 5_000).unref()
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as { port: number }
  return { url: `http://127.0.0.1:${port}`, connections: () => count, close: () => { for (const s of sockets) s.destroy(); server.close() } }
}

// 直接用 SQL 建一筆已付款訂單（跟練習 2 的結帳交易寫一樣的東西），回傳訂單 id
export async function placeOrder(pool: Pool, customerId: number, items: Record<number, number>, createdAt: Date): Promise<number> {
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    const { rows: [o] } = await c.query<{ id: number }>('INSERT INTO orders (customer_id, idempotency_key, created_at) VALUES ($1, gen_random_uuid()::text, $2) RETURNING id', [customerId, createdAt])
    let total = 0
    for (const [pid, qty] of Object.entries(items).sort(([a], [b]) => Number(a) - Number(b))) {
      const { rows: [p] } = await c.query<{ price: number }>('UPDATE products SET stock = stock - $2, sold = sold + $2, version = version + 1 WHERE id = $1 RETURNING price', [Number(pid), qty])
      await c.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)', [o.id, Number(pid), qty, p.price])
      total += p.price * qty
    }
    await c.query('UPDATE orders SET total = $2 WHERE id = $1', [o.id, total])
    await c.query(`INSERT INTO outbox (type, aggregate_id) VALUES ('order.paid', $1)`, [o.id])
    await c.query('COMMIT')
    return o.id
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  } finally {
    c.release()
  }
}
