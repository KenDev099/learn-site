// 下單：讀商品價格、算金額、寫進 orders 與 order_items，全部在同一個交易裡
import type { Pool } from 'pg'
import { orderTotal } from './price.ts'

export async function createOrder(pool: Pool, items: { productId: number, quantity: number }[]) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const ids = items.map(i => i.productId)
    const { rows } = await client.query<{ id: number, price: number }>('SELECT id, price FROM products WHERE id = ANY($1)', [ids])
    const price = new Map(rows.map(r => [r.id, r.price]))
    const lines = items.map(i => {
      const p = price.get(i.productId)
      if (p === undefined) throw new Error(`沒有這個商品：${i.productId}`)
      return { productId: i.productId, price: p, quantity: i.quantity }
    })
    const total = orderTotal(lines)
    const order = await client.query<{ id: string }>('INSERT INTO orders (total) VALUES ($1) RETURNING id', [total])
    const id = order.rows[0].id
    for (const l of lines)
      await client.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)', [id, l.productId, l.quantity, l.price])
    await client.query('COMMIT')
    return { id, total }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
