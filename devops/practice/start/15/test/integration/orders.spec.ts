// 整合測試：連真的 PostgreSQL。需要 DATABASE_URL，而且 migration 要先跑過（npm run migrate）
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { createOrder } from '../../src/orders.ts'

if (!process.env.DATABASE_URL) throw new Error('整合測試需要 DATABASE_URL，例如 postgres://cafe:cafe@localhost:5432/cafe')
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
after(() => pool.end())

test('下單後 orders 與 order_items 都寫進資料庫，金額用資料庫裡的價格', async () => {
  const { id, total } = await createOrder(pool, [{ productId: 2, quantity: 2 }, { productId: 5, quantity: 1 }])
  assert.equal(total, 290)
  const { rows } = await pool.query('SELECT product_id, quantity, unit_price FROM order_items WHERE order_id = $1 ORDER BY product_id', [id])
  assert.deepEqual(rows, [{ product_id: 2, quantity: 2, unit_price: 110 }, { product_id: 5, quantity: 1, unit_price: 70 }])
})

test('有一個品項不存在時整筆訂單回滾', async () => {
  const before = await pool.query('SELECT count(*)::int AS n FROM orders')
  await assert.rejects(createOrder(pool, [{ productId: 1, quantity: 1 }, { productId: 999, quantity: 1 }]), /沒有這個商品/)
  const now = await pool.query('SELECT count(*)::int AS n FROM orders')
  assert.equal(now.rows[0].n, before.rows[0].n)
})
