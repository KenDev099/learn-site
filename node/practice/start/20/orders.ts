// 練習 3：下單（交易、不超賣、死結重試）
import type pg from 'pg'
import { OutOfStockError } from './errors.ts'

export type OrderItem = { productId: number, quantity: number }

// TODO：借一條連線 → BEGIN → fn(client) → COMMIT；出錯時 ROLLBACK 再丟出去；不論如何都要歸還連線
// 現在的寫法每一句都可能跑在不同的連線上
export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient | pg.Pool) => Promise<T>): Promise<T> {
  await pool.query('BEGIN')
  try {
    const result = await fn(pool)
    await pool.query('COMMIT')
    return result
  } catch (err) {
    await pool.query('ROLLBACK')
    throw err
  }
}

// TODO：
// - 依 productId 由小到大扣庫存，用一句原子 UPDATE（庫存不夠就不會改到），改不到就丟 OutOfStockError(productId)
// - 建立 orders（ordered_at 用 now()，total = 單價 × 數量的總和）與 order_items（unit_price 用當下的價格）
// - 遇到死結 40P01 或序列化失敗 40001：整個交易重來，最多一共做 3 次；其他錯誤不重試
// - 回傳 { orderId, total }
export async function placeOrder(pool: pg.Pool, customerId: number, items: OrderItem[]) {
  return withTransaction(pool, async (client) => {
    let total = 0
    for (const item of items) {
      const { rows } = await client.query('SELECT price, stock FROM products WHERE id = $1', [item.productId])
      if (!rows[0] || rows[0].stock < item.quantity) throw new OutOfStockError(item.productId)
      await client.query('UPDATE products SET stock = $1 WHERE id = $2', [rows[0].stock - item.quantity, item.productId])
      total += rows[0].price * item.quantity
    }
    const order = await client.query('INSERT INTO orders (customer_id, ordered_at, total) VALUES ($1, now(), $2) RETURNING id', [customerId, total])
    const orderId: number = order.rows[0].id
    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price) SELECT $1, id, $2, price FROM products WHERE id = $3',
        [orderId, item.quantity, item.productId])
    }
    return { orderId, total }
  })
}
