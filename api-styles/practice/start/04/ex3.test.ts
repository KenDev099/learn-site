import test from 'node:test'
import assert from 'node:assert/strict'
import { createDb, type Db } from '../../helpers/db.ts'
import { mulberry32 } from '../../helpers/coffee.ts'
import { gql, quietYogaLogs } from '../../helpers/graphql.ts'
import { buildYoga } from './server.ts'
import { createContext, type Context } from './context.ts'

const opts = { timeout: 10_000 }
quietYogaLogs()
const random = mulberry32(Date.now())

// 建資料庫要幾秒，放在測試外面先建好（不算進每個測試的逾時）
const shared = await createDb({ orders: 20, seed: Date.now() })

// 記下每一句 SQL 和參數：用來檢查同一個 id 有沒有被查兩次
function recorded(db: Db) {
  const calls: { sql: string, params: unknown[] }[] = []
  const wrapped: Db = { ...db, query: (sql, params = []) => { calls.push({ sql, params }); return db.query(sql, params) } }
  return { db: wrapped, calls }
}

test('兩個請求不共用 loader：第二個請求查自己的資料、看得到最新的價格', opts, async () => {
  const { db, pg, log } = shared
  const yoga = buildYoga(db)                       // 用你的 context.ts
  const id = 1 + Math.floor(random() * 6)
  const first = await gql(yoga, `{ product(id: "${id}") { price } }`, undefined, { 'x-customer-id': '1' })
  assert.equal(first.body.errors, undefined, `不應該有錯誤：${first.body.errors?.[0]?.message}`)
  const price = 200 + Math.floor(random() * 100)
  await pg.query('UPDATE products SET price = $1 WHERE id = $2', [price, id])   // 別人在兩個請求之間改了價格
  log.length = 0
  const second = await gql(yoga, `{ product(id: "${id}") { price } }`, undefined, { 'x-customer-id': '2' })
  assert.ok(log.length > 0, '第二個請求一句 SQL 都沒發：它拿到的是上一個請求留下的快取。loader 不能存在模組變數裡，createContext 每次都要 createLoaders(db)')
  assert.equal(second.body.data?.product?.price, price, '第二個請求讀到舊價格：每個請求要有自己的 loader')
})

test('同一個請求裡，同一個商品只查一次（不要關掉快取）', opts, async () => {
  const base = shared
  const { db, calls } = recorded(base.db)
  const yoga = buildYoga(db)
  const { rows } = await base.pg.query<{ product_id: number }>('SELECT product_id FROM order_items WHERE order_id IN (SELECT id FROM orders ORDER BY ordered_at DESC, id DESC LIMIT 10) LIMIT 1')
  const id = rows[0].product_id
  const { body } = await gql(yoga, `{ product(id: "${id}") { name } orders(last: 10) { items { product { name } } } }`)
  assert.equal(body.errors, undefined, `不應該有錯誤：${body.errors?.[0]?.message}`)
  const loaded = calls.filter(c => /from\s+products/i.test(c.sql)).flatMap(c => [c.params[0]].flat())
  assert.ok(loaded.length > 0, '沒有查 products：Query.product 和 OrderItem.product 要用 ctx.loaders.productById')
  assert.equal(new Set(loaded).size, loaded.length, `商品 ${id} 在同一個請求裡被查了不只一次（${JSON.stringify(loaded)}）：DataLoader 的快取要開著（不要 cache: false），同一個請求重複 load 同一個 id 直接用快取`)
})

test('updatePrice 之後，同一個請求後面的讀取看到新價格', opts, async () => {
  const { db, pg } = shared
  const seen: Context[] = []
  const yoga = buildYoga(db, { context: () => { const c = createContext(db); seen.push(c); return c } })   // 留住這個請求的 context，請求結束後檢查它的 loader
  const id = 1 + Math.floor(random() * 6)
  const p1 = 150 + Math.floor(random() * 50), p2 = p1 + 1 + Math.floor(random() * 20)
  const { body } = await gql(yoga, `mutation ($id: ID!, $p1: Int!, $p2: Int!) {
    a: updatePrice(productId: $id, price: $p1) { id price }
    b: updatePrice(productId: $id, price: $p2) { id price }
    c: updatePrice(productId: "99", price: 1) { id }
  }`, { id: String(id), p1, p2 })
  assert.equal(body.errors, undefined, `不應該有錯誤：${body.errors?.[0]?.message}`)
  assert.equal(body.data.a.price, p1, `updatePrice 回傳的是改價前的舊價格：改完之後用 ctx.loaders.productById.clear(id)（或 clear 之後 prime 新的那一列），loader 才不會一直給你快取裡的舊值`)
  assert.equal(body.data.b.price, p2, '第二次 updatePrice 回傳的價格不對：每次改完都要清掉或更新快取')
  assert.equal(body.data.c, null, '不存在的商品回 null')
  const { rows } = await pg.query<{ price: number }>('SELECT price FROM products WHERE id = $1', [id])
  assert.equal(rows[0].price, p2, '資料庫裡的價格要是最後一次改的價格')
  const later = await seen[0].loaders.productById.load(id)
  assert.equal(later?.price, p2, `mutation 回傳的價格對了，但這個請求的 productById 快取裡還是舊價格 ${later?.price}：之後同一個請求再讀這個商品會拿到舊值。改完要 clear(id)（或 clear 之後 prime 新的那一列），不要只回傳 UPDATE 的結果`)
})
