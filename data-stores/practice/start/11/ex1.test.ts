import { before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { usePg } from '../../helpers/pg.ts'
import { createTables, seedMenu } from './schema.ts'
import { deleteProduct, NotFoundError, updateProduct } from './outbox.ts'

const pool = usePg(11)
// 交給學習者的 pool：記下直接用 pool.query 送出的 BEGIN／COMMIT／ROLLBACK
const poolTx: string[] = []
const db = new Proxy(pool, {
  get(target, prop) {
    const v = Reflect.get(target, prop, target)
    if (prop !== 'query') return typeof v === 'function' ? v.bind(target) : v
    return (...args: unknown[]) => {
      const sql = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? ''
      const m = sql.match(/^\s*(BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK)\b/i)
      if (m) poolTx.push(m[1].toUpperCase())
      return (v as (...a: unknown[]) => unknown).apply(target, args)
    }
  },
}) as typeof pool

const product = async (id: number) => (await pool.query('SELECT name, price, available, version FROM products WHERE id = $1', [id])).rows[0]
const events = async (id: number) => (await pool.query('SELECT version, op, payload FROM outbox WHERE aggregate_id = $1 ORDER BY id', [id])).rows

describe('練習 1：同一個交易寫入 products 與 outbox', { timeout: 30_000 }, () => {
  before(async () => { await createTables(pool); await seedMenu(pool) })

  test('更新商品：version 加 1，outbox 多一筆 upsert 事件，payload 是更新後的內容', async () => {
    const v = await updateProduct(db, 12, { price: 120 })
    assert.equal(v, 2, `updateProduct 要回傳更新後的 version（1 → 2），實際 ${v}`)
    assert.deepEqual(await product(12), { name: '拿鐵', price: 120, available: true, version: 2 }, 'products 的拿鐵要改成 120 元、version 2；沒給的欄位維持原值')
    assert.deepEqual(await events(12), [{ version: 2, op: 'upsert', payload: { id: 12, name: '拿鐵', category: 'coffee', price: 120, available: true } }],
      'outbox 要有一筆 { version: 2, op: upsert, payload: 更新後的 { id, name, category, price, available } }')
    await updateProduct(db, 14, { available: false })
    const e14 = await events(14)
    assert.equal(e14.length, 1, '下架伯爵紅茶也要寫一筆事件')
    assert.equal(e14[0].payload?.available, false, 'available: false 也是要套用的值，不能被當成「沒給」（用 ?? 或 COALESCE，不要用 ||）')
    assert.equal((await product(14)).available, false, 'products 的伯爵紅茶要變成 available = false')
  })

  test('商品不存在：丟 NotFoundError，也不寫 outbox', async () => {
    await assert.rejects(updateProduct(db, 99, { price: 1 }), NotFoundError, '更新不存在的商品要丟 NotFoundError')
    await assert.rejects(deleteProduct(db, 99), NotFoundError, '刪除不存在的商品要丟 NotFoundError')
    assert.deepEqual(await events(99), [], '商品不存在時 outbox 不能多事件')
  })

  test('outbox 寫不進去時，products 也不能被改（兩個寫入要在同一個交易）', async () => {
    await pool.query('ALTER TABLE outbox ADD CONSTRAINT t11_block_13 CHECK (aggregate_id <> 13)')
    try {
      await assert.rejects(updateProduct(db, 13, { price: 999 }), 'outbox 寫入失敗時，錯誤要往外丟')
      assert.deepEqual(await product(13), { name: '卡布奇諾', price: 110, available: true, version: 1 },
        'outbox 寫入失敗，products 卻已經改了：products 的 UPDATE 和 outbox 的 INSERT 要在同一個 BEGIN … COMMIT 裡，用同一個 client')
    } finally {
      await pool.query('ALTER TABLE outbox DROP CONSTRAINT t11_block_13')
    }
  })

  test('同一個商品並發更新 10 次：version 2～11 連續、每個版本剛好一筆事件', async () => {
    const versions = await Promise.all(Array.from({ length: 10 }, (_, i) => updateProduct(db, 15, { price: 71 + i })))
    assert.deepEqual([...versions].sort((a, b) => a - b), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      `10 次更新回傳的版本要是 2～11 各一次，實際 ${JSON.stringify(versions)}：讓資料庫算 version = version + 1，不要先讀出來在程式裡加`)
    assert.equal((await product(15)).version, 11, '最後的 version 要是 11')
    assert.deepEqual((await events(15)).map(e => e.version), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'outbox 的事件依寫入順序要是版本 2～11')
  })

  test('刪除商品：products 少一列，outbox 多一筆 delete 事件（version = 刪除前 + 1）', async () => {
    await updateProduct(db, 16, { price: 125 })   // 起司蛋糕變成 version 2
    await deleteProduct(db, 16)
    assert.equal(await product(16), undefined, '起司蛋糕要從 products 刪除')
    const e16 = await events(16)
    assert.equal(e16.length, 2, `起司蛋糕應該有 2 筆事件（更新、刪除），實際 ${e16.length} 筆：刪除也要寫事件，搜尋那邊才知道要移除`)
    assert.deepEqual(e16[1], { version: 3, op: 'delete', payload: null }, '刪除事件要是 { version: 刪除前的版本 + 1 = 3, op: delete, payload: null }')
  })

  test('交易用 pool.connect() 借來的同一條連線，不是 pool.query', () => {
    assert.deepEqual(poolTx, [], `用 pool.query 送出了 ${[...new Set(poolTx)].join('、')}：pool.query 每一句可能用不同的連線，BEGIN 和 UPDATE 不一定在同一個交易裡。要 const client = await pool.connect()，在 client 上 BEGIN／COMMIT，最後 client.release()`)
  })
})
