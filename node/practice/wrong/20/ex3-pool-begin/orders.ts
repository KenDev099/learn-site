// 練習 3：下單（交易、不超賣、死結重試）
import type pg from 'pg'
import { OutOfStockError } from './errors.ts'

export type OrderItem = { productId: number, quantity: number }

export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  await pool.query("BEGIN")
  try {
    const result = await fn(pool as unknown as pg.PoolClient)
    await pool.query("COMMIT")
    return result
  } catch (err) {
    await pool.query("ROLLBACK")
    throw err
  }
}

const RETRYABLE = new Set(['40P01', '40001'])   // 死結、序列化失敗：整個交易重來就可能成功
const MAX_ATTEMPTS = 3

export async function placeOrder(pool: pg.Pool, customerId: number, items: OrderItem[]) {
  // 所有交易都用同樣的順序鎖商品，就不會互相等待形成死結
  const sorted = [...items].sort((a, b) => a.productId - b.productId)
  for (let attempt = 1; ; attempt++) {
    try {
      return await withTransaction(pool, client => insertOrder(client, customerId, sorted))
    } catch (err) {
      const code = (err as { code?: string }).code
      if (!code || !RETRYABLE.has(code) || attempt >= MAX_ATTEMPTS) throw err
    }
  }
}

async function insertOrder(client: pg.PoolClient, customerId: number, items: OrderItem[]) {
  let total = 0
  const prices = new Map<number, number>()
  for (const item of items) {
    // 檢查和扣除在同一句完成：庫存不夠時 WHERE 不成立，一列都不會改
    const res = await client.query<{ price: number }>(
      'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING price',
      [item.quantity, item.productId])
    if (res.rowCount === 0) throw new OutOfStockError(item.productId)
    prices.set(item.productId, res.rows[0].price)
    total += res.rows[0].price * item.quantity
  }
  const order = await client.query<{ id: number }>(
    'INSERT INTO orders (customer_id, ordered_at, total) VALUES ($1, now(), $2) RETURNING id', [customerId, total])
  const orderId = order.rows[0].id
  for (const item of items) {
    await client.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
      [orderId, item.productId, item.quantity, prices.get(item.productId)])
  }
  return { orderId, total }
}
