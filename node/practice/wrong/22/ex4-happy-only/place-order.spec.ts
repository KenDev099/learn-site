// 練習 4：為 orders.ts 的 placeOrder 寫測試。執行：node --test place-order.spec.ts
// 要先在 learn/node/practice 執行 docker compose up -d --wait
import test from 'node:test'
import assert from 'node:assert/strict'
import { placeOrder } from './orders.ts'
import { OutOfStockError } from './errors.ts'
import { createTestSchema } from './test-db.ts'

// 這個測試檔自己的 schema：和別的測試檔、別人同時跑的測試都互不影響
const { pool } = await createTestSchema()

// 工廠函式：每個測試建自己的商品，不依賴別的測試改過的庫存
async function newProduct(price: number, stock: number) {
  const { rows } = await pool.query<{ id: number }>(
    'INSERT INTO products (name, price, stock) VALUES ($1, $2, $3) RETURNING id', [`測試豆 ${crypto.randomUUID()}`, price, stock])
  return rows[0].id
}
const stockOf = async (id: number) =>
  (await pool.query<{ stock: number }>('SELECT stock FROM products WHERE id = $1', [id])).rows[0].stock

test('下單成功：回傳 total、扣庫存', { timeout: 5000 }, async () => {
  const latte = await newProduct(110, 10)

  const result = await placeOrder(pool, 1, [{ productId: latte, quantity: 2 }])

  assert.equal(result.total, 220)
  assert.equal(await stockOf(latte), 8)
})

// 在下面繼續寫：庫存不夠時丟 OutOfStockError 而且什麼都沒改（不超賣、沒留下訂單）、
// 第二項商品不夠時第一項的庫存也要還原、失敗之後連線有還回池子（pool.idleCount === pool.totalCount）
