import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import pg from 'pg'
import { COFFEE_SQL, createTestDb } from '../../helpers/db.ts'
import { OutOfStockError } from './errors.ts'

const opts = { timeout: 15_000 }
type Item = { productId: number, quantity: number }
type PlaceOrder = (pool: pg.Pool, customerId: number, items: Item[]) => Promise<{ orderId: number, total: number }>

const { url, pool: db } = await createTestDb([COFFEE_SQL, join(import.meta.dirname, 'schema.sql')])

async function load() {
  const mod: { placeOrder?: unknown } = await import('./orders.ts')
  assert.equal(typeof mod.placeOrder, 'function', 'orders.ts 要 export placeOrder(pool, customerId, items)')
  return mod.placeOrder as PlaceOrder
}

// 給學習者的程式一個自己的池子：借不到連線 2 秒就失敗，沒還連線時測試不會卡住
function learnerPool(max = 10) {
  const pool = new pg.Pool({ connectionString: url, max, connectionTimeoutMillis: 2000 })
  pool.on('error', () => {})
  return pool
}
async function closePool(pool: pg.Pool) {
  assert.equal(pool.idleCount, pool.totalCount, `有 ${pool.totalCount - pool.idleCount} 條連線借了沒還：withTransaction 要在 finally 呼叫 client.release()`)
  await pool.end()
}

async function newProduct(price: number, stock: number) {
  const { rows } = await db.query<{ id: number }>('INSERT INTO products (name, price, stock) VALUES ($1, $2, $3) RETURNING id', [`測試豆 ${Math.random()}`, price, stock])
  return rows[0].id
}
const stockOf = async (id: number) => (await db.query<{ stock: number }>('SELECT stock FROM products WHERE id = $1', [id])).rows[0].stock
const countRows = async () => {
  const { rows } = await db.query<{ o: number, i: number }>('SELECT (SELECT count(*)::int FROM orders) AS o, (SELECT count(*)::int FROM order_items) AS i')
  return rows[0]
}

test('一筆訂單：建立 orders 與 order_items，扣庫存，回傳 { orderId, total }', opts, async () => {
  const placeOrder = await load()
  const { pool, stats } = flakyPool(() => null)
  const price = 100 + Math.floor(Math.random() * 50)
  const a = await newProduct(price, 10), b = await newProduct(70, 10)
  const input = [{ productId: b, quantity: 1 }, { productId: a, quantity: 2 }]
  const r = await placeOrder(pool, 2, input)
  assert.deepEqual(input, [{ productId: b, quantity: 1 }, { productId: a, quantity: 2 }], '不能改到傳進來的 items（排序要複製一份：[...items].sort(…)）')
  const locked = stats().updateParams.map(ps => (ps.includes(a) ? a : ps.includes(b) ? b : null))
  assert.deepEqual(locked, [a, b], `扣庫存要依 productId 由小到大（${a} 再 ${b}），所有交易用同樣的順序上鎖才不會死結`)
  assert.equal(r.total, price * 2 + 70, 'total 是單價 × 數量的總和')
  const order = (await db.query('SELECT customer_id, total FROM orders WHERE id = $1', [r.orderId])).rows[0]
  assert.deepEqual(order, { customer_id: 2, total: r.total }, 'orders 要有這筆訂單')
  const items = (await db.query('SELECT product_id, quantity, unit_price FROM order_items WHERE order_id = $1 ORDER BY product_id', [r.orderId])).rows
  assert.deepEqual(items, [{ product_id: a, quantity: 2, unit_price: price }, { product_id: b, quantity: 1, unit_price: 70 }].sort((x, y) => x.product_id - y.product_id))
  assert.equal(await stockOf(a), 8)
  assert.equal(await stockOf(b), 9)
  await closePool(pool)
})

test('10 筆並發訂單搶 3 杯：剛好 3 筆成功，庫存 0，失敗的不留下資料', opts, async () => {
  const placeOrder = await load()
  const pool = learnerPool()
  const id = await newProduct(110, 3)
  const before = await countRows()
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => placeOrder(pool, 1, [{ productId: id, quantity: 1 }])))
  const ok = results.filter(r => r.status === 'fulfilled').length
  const stock = await stockOf(id)
  assert.ok(stock >= 0, `庫存變成 ${stock}：先 SELECT 再 UPDATE 成算好的值會超賣，要用 stock = stock - $1 WHERE stock >= $1`)
  assert.equal(ok, 3, `只有 3 杯，卻有 ${ok} 筆成功`)
  assert.equal(stock, 0)
  for (const r of results) {
    if (r.status === 'rejected') {
      assert.ok(r.reason instanceof OutOfStockError, `失敗的訂單要丟 OutOfStockError，收到 ${String(r.reason)}`)
      assert.equal(r.reason.productId, id, 'OutOfStockError 要帶 productId')
    }
  }
  const after = await countRows()
  assert.equal(after.o - before.o, 3, '只能多 3 筆 orders')
  assert.equal(after.i - before.i, 3, '只能多 3 筆 order_items')
  await closePool(pool)
})

test('第二個品項庫存不足：整筆 ROLLBACK，第一個品項的庫存不能少，連線要歸還', opts, async () => {
  const placeOrder = await load()
  const pool = learnerPool(1)   // 只有一條連線：失敗後的下一筆訂單一定借到同一條
  const a = await newProduct(80, 5)   // id 較小，會先扣
  const b = await newProduct(90, 0)
  const before = await countRows()
  for (let i = 0; i < 3; i++) {
    const err = await placeOrder(pool, 3, [{ productId: b, quantity: 1 }, { productId: a, quantity: 1 }]).then(() => null, (e: unknown) => e)
    assert.ok(err instanceof OutOfStockError, `要丟 OutOfStockError，收到 ${String(err)}`)
    assert.equal(err.productId, b)
  }
  assert.equal(await stockOf(a), 5, '庫存不足時整筆要 ROLLBACK：先扣掉的品項要還原')
  assert.deepEqual(await countRows(), before, '失敗的訂單不能留下 orders 或 order_items')
  await placeOrder(pool, 3, [{ productId: a, quantity: 1 }])
  assert.equal(await stockOf(a), 4, '下一筆成功的訂單只能扣 1：失敗時沒有 ROLLBACK 就歸還的連線還留在交易裡，會被下一筆的 COMMIT 一起提交')
  await closePool(pool)
})

test('BEGIN、COMMIT、ROLLBACK 要在同一條借出的連線上執行，不能用 pool.query', opts, async () => {
  const placeOrder = await load()
  const pool = learnerPool()
  const viaPool: string[] = []
  const query = pool.query.bind(pool) as (...args: unknown[]) => unknown
  ;(pool as unknown as { query: unknown }).query = (...args: unknown[]) => {
    viaPool.push(String(typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string }).text))
    return query(...args)
  }
  const a = await newProduct(80, 5), b = await newProduct(90, 0)
  await placeOrder(pool, 1, [{ productId: a, quantity: 1 }])
  await placeOrder(pool, 1, [{ productId: a, quantity: 1 }, { productId: b, quantity: 1 }]).catch(() => {})
  assert.deepEqual(viaPool, [], `交易裡的每一句都要用 pool.connect() 借到的同一個 client，不能用 pool.query（收到：${viaPool.join('；')}）`)
  await closePool(pool)
})

test('順序相反的並發訂單都能完成（依 id 排序上鎖，或遇到死結重試）', opts, async () => {
  const placeOrder = await load()
  const pool = learnerPool()
  const a = await newProduct(80, 100), b = await newProduct(90, 100)
  const jobs = Array.from({ length: 10 }, (_, i) => placeOrder(pool, 1, i % 2
    ? [{ productId: a, quantity: 1 }, { productId: b, quantity: 1 }]
    : [{ productId: b, quantity: 1 }, { productId: a, quantity: 1 }]))
  const results = await Promise.allSettled(jobs)
  const failed = results.filter(r => r.status === 'rejected')
  assert.equal(failed.length, 0, `有 ${failed.length} 筆失敗：${String((failed[0] as PromiseRejectedResult | undefined)?.reason)}`)
  assert.equal(await stockOf(a), 90)
  assert.equal(await stockOf(b), 90)
  await closePool(pool)
})

// 讓第 n 次（從 1 算）扣庫存的 UPDATE 丟出指定 SQLSTATE 的錯誤，模擬死結或序列化失敗
function flakyPool(failOn: (n: number) => string | null) {
  const pool = learnerPool()
  let updates = 0, connects = 0
  const updateParams: unknown[][] = []
  const connect = pool.connect.bind(pool) as () => Promise<pg.PoolClient>
  ;(pool as unknown as { connect: unknown }).connect = async () => {
    connects++
    const client = await connect()
    const query = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>
    ;(client as unknown as { query: unknown }).query = async (...args: unknown[]) => {
      const text = typeof args[0] === 'string' ? args[0] : String((args[0] as { text?: string }).text)
      if (/^\s*UPDATE\s+products/i.test(text)) {
        updateParams.push(Array.isArray(args[1]) ? args[1] : ((args[0] as { values?: unknown[] }).values ?? []))
        const code = failOn(++updates)
        if (code) throw Object.assign(new Error(`模擬的資料庫錯誤 ${code}`), { code })
      }
      return query(...args)
    }
    return client
  }
  return { pool, stats: () => ({ updates, connects, updateParams }) }
}

test('死結（40P01）與序列化失敗（40001）：整個交易重試，最多一共 3 次', opts, async () => {
  const placeOrder = await load()
  const id = await newProduct(80, 100)
  for (const code of ['40P01', '40001']) {
    const { pool, stats } = flakyPool(n => (n <= 2 ? code : null))
    const r = await placeOrder(pool, 1, [{ productId: id, quantity: 1 }])
    assert.ok(r.orderId > 0, `前兩次 ${code}、第三次成功，要回傳訂單`)
    assert.equal(stats().connects, 3, `${code} 要整個交易重來（重新借連線、重新 BEGIN），一共 3 次`)
    await closePool(pool)
  }
  assert.equal(await stockOf(id), 98, '失敗的嘗試要 ROLLBACK，最後只扣到成功的那兩次')
  const { pool, stats } = flakyPool(() => '40P01')
  const err = await placeOrder(pool, 1, [{ productId: id, quantity: 1 }]).then(() => null, (e: { code?: string }) => e)
  assert.equal(err?.code, '40P01', '一直死結時，第 3 次失敗後把錯誤丟出去')
  assert.equal(stats().connects, 3, `最多一共做 3 次，實際做了 ${stats().connects} 次`)
  await closePool(pool)
})

test('其他錯誤不重試：庫存不足、違反約束', opts, async () => {
  const placeOrder = await load()
  const empty = await newProduct(80, 0)
  const { pool, stats } = flakyPool(() => null)
  await assert.rejects(placeOrder(pool, 1, [{ productId: empty, quantity: 1 }]), OutOfStockError)
  assert.equal(stats().connects, 1, '庫存不足重試也不會成功，不要重試')
  const ok = await newProduct(80, 5)
  const err = await placeOrder(pool, 99999, [{ productId: ok, quantity: 1 }]).then(() => null, (e: { code?: string }) => e)
  assert.equal(err?.code, '23503', '不存在的顧客違反外鍵（23503），原樣丟出')
  assert.equal(stats().connects, 2, '違反約束不要重試')
  assert.equal(await stockOf(ok), 5, '失敗的訂單要 ROLLBACK')
  await closePool(pool)
})
