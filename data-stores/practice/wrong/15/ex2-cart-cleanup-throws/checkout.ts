// 練習 2：結帳 checkout(deps, { customerId, idempotencyKey, now })，回傳 { orderId, total }（都是 number）
// 照這個順序：
//   1. 限流：INCR rateKey(customerId, now)，再送 PEXPIRE key RATE_WINDOW_MS NX；計數超過 RATE_LIMIT 就丟 RateLimitedError
//   2. 冪等的快速路徑：GET idemKey(idempotencyKey)，有值（JSON 的 { orderId, total }）就直接回傳
//   3. 冪等的記錄系統：orders 裡已經有這個 idempotency_key，就回傳那筆的 { orderId: id, total }（Redis 被清空時靠這一步）
//   4. 讀購物車：HGETALL cartKey(customerId)，得到 { productId: 數量 }（都是字串）；空的就丟 EmptyCartError
//   5. 一個 PostgreSQL 交易（同一個 client，BEGIN … COMMIT）：
//        a. INSERT INTO orders (customer_id, idempotency_key, created_at) … ON CONFLICT (idempotency_key) DO NOTHING RETURNING id
//           （created_at 用 new Date(now)）。沒有回傳列 = 同一個鍵的另一個請求剛建好訂單 → ROLLBACK，回傳那筆訂單
//        b. 品項依 product id 由小到大：UPDATE products SET stock = stock - 數量, sold = sold + 數量, version = version + 1
//           WHERE id = $1 AND stock >= 數量 RETURNING price；沒有回傳列就是庫存不足 → ROLLBACK，丟 OutOfStockError
//        c. INSERT order_items（unit_price 用 b 回傳的 price），算出總額後 UPDATE orders SET total
//        d. INSERT INTO outbox (type, aggregate_id) VALUES ('order.paid', 訂單 id)
//   6. COMMIT 之後的收尾，失敗只用 console.warn 記下，不影響回傳：
//        SET idemKey(idempotencyKey) JSON.stringify({ orderId, total }) EX IDEM_TTL_SEC；刪除購物車
//   checkout 不呼叫 Elasticsearch、S3：搜尋與收據交給練習 3 的 worker
import type { PoolClient } from 'pg'
import {
  cartKey, EmptyCartError, IDEM_TTL_SEC, idemKey, OutOfStockError, RATE_LIMIT, RATE_WINDOW_MS, RateLimitedError, rateKey,
  type CheckoutResult, type Deps,
} from './schema.ts'

export type CheckoutInput = { customerId: number; idempotencyKey: string; now: number }

export async function checkout(deps: Deps, { customerId, idempotencyKey, now }: CheckoutInput): Promise<CheckoutResult> {
  const { pool, redis } = deps

  // 1. 限流：INCR 是原子的，並發的請求各拿到不同的計數
  const rk = rateKey(customerId, now)
  const count = await redis.incr(rk)
  await redis.pexpire(rk, RATE_WINDOW_MS, 'NX')
  if (count > RATE_LIMIT) throw new RateLimitedError(`顧客 ${customerId} 結帳太頻繁`)

  // 2. 冪等：先問 Redis（快），再問 PostgreSQL（準）
  const saved = await redis.get(idemKey(idempotencyKey))
  if (saved) return JSON.parse(saved) as CheckoutResult
  const existing = await findOrder(pool, idempotencyKey)
  if (existing) return existing

  // 4. 購物車
  const cart = await redis.hgetall(cartKey(customerId))
  const items = Object.entries(cart).map(([pid, qty]) => ({ productId: Number(pid), quantity: Number(qty) })).sort((a, b) => a.productId - b.productId)
  if (items.length === 0) throw new EmptyCartError(`顧客 ${customerId} 的購物車是空的`)

  // 5. 訂單、品項、庫存、outbox 在同一個交易
  const client = await pool.connect()
  let result: CheckoutResult
  try {
    await client.query('BEGIN')
    const { rows: [order] } = await client.query<{ id: number }>(
      `INSERT INTO orders (customer_id, idempotency_key, created_at) VALUES ($1, $2, $3)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [customerId, idempotencyKey, new Date(now)])
    if (!order) {
      await client.query('ROLLBACK')
      return (await findOrder(client, idempotencyKey))!
    }
    let total = 0
    for (const { productId, quantity } of items) {
      const { rows: [p] } = await client.query<{ price: number }>(
        `UPDATE products SET stock = stock - $2, sold = sold + $2, version = version + 1
          WHERE id = $1 AND stock >= $2 RETURNING price`,
        [productId, quantity])
      if (!p) throw new OutOfStockError(`商品 ${productId} 庫存不足`)
      await client.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)', [order.id, productId, quantity, p.price])
      total += p.price * quantity
    }
    await client.query('UPDATE orders SET total = $2 WHERE id = $1', [order.id, total])
    await client.query(`INSERT INTO outbox (type, aggregate_id) VALUES ('order.paid', $1)`, [order.id])
    await client.query('COMMIT')
    result = { orderId: order.id, total }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  // 6. 收尾：訂單已經成立，這裡失敗不能讓結帳變成失敗
  await redis.set(idemKey(idempotencyKey), JSON.stringify(result), 'EX', IDEM_TTL_SEC)
  await redis.del(cartKey(customerId))
  return result
}

async function findOrder(db: Pick<PoolClient, 'query'>, idempotencyKey: string): Promise<CheckoutResult | null> {
  const { rows: [o] } = await db.query<{ id: number; total: number }>('SELECT id, total FROM orders WHERE idempotency_key = $1', [idempotencyKey])
  return o ? { orderId: o.id, total: o.total } : null
}
