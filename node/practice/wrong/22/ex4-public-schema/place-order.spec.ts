// 練習 4：為 orders.ts 的 placeOrder 寫測試。執行：node --test place-order.spec.ts
// 要先在 learn/node/practice 執行 docker compose up -d --wait
import test from 'node:test'
import assert from 'node:assert/strict'
import { placeOrder } from './orders.ts'
import { OutOfStockError } from './errors.ts'
import pg from 'pg'

// 這個測試檔自己的 schema：和別的測試檔、別人同時跑的測試都互不影響
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://learn:learn@localhost:54329/coffee' })
test.after(() => pool.end())

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
const orderCount = async () => (await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM orders')).rows[0].n

test('庫存不夠：丟 OutOfStockError，不超賣、不留下訂單，連線有還回池子', { timeout: 5000 }, async () => {
  const cake = await newProduct(120, 2)
  const before = await orderCount()

  await assert.rejects(placeOrder(pool, 1, [{ productId: cake, quantity: 3 }]), OutOfStockError)

  assert.equal(await stockOf(cake), 2, '庫存不能變成負的')
  assert.equal(await orderCount(), before, '失敗的訂單不能留下來')
  assert.equal(pool.idleCount, pool.totalCount, '失敗之後連線要還回池子')
})

test('第二項商品不夠：整筆失敗，第一項扣掉的庫存也還原', { timeout: 5000 }, async () => {
  const latte = await newProduct(110, 10)
  const cake = await newProduct(120, 1)

  await assert.rejects(placeOrder(pool, 1, [{ productId: latte, quantity: 2 }, { productId: cake, quantity: 5 }]), OutOfStockError)

  assert.equal(await stockOf(latte), 10, '交易失敗要 ROLLBACK，拿鐵的庫存要回到 10')
  assert.equal(await stockOf(cake), 1)
})

test('剛好買完：庫存變 0，再買一杯就失敗', { timeout: 5000 }, async () => {
  const tea = await newProduct(90, 3)

  await placeOrder(pool, 2, [{ productId: tea, quantity: 3 }])
  assert.equal(await stockOf(tea), 0)
  await assert.rejects(placeOrder(pool, 2, [{ productId: tea, quantity: 1 }]), OutOfStockError)
  assert.equal(await stockOf(tea), 0)
})
