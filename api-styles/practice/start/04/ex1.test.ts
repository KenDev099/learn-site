import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createDb } from '../../helpers/db.ts'
import { buildYoga } from './server.ts'
import { naiveResolvers } from './naive.ts'
import { countQueries } from './count.ts'

const opts = { timeout: 10_000 }
// 建資料庫要幾秒，放在測試外面先建好（不算進每個測試的逾時）
const rand = await createDb({ orders: 45, seed: Date.now() })   // 隨機訂單：寫死的數字不會過
const fixed = await createDb({ orders: 40 })                    // 跟 examples/measure.ts 同一份資料
const QUERY = 'query ($n: Int!) { orders(last: $n) { id total customer { name } items { quantity product { name price } } } }'

// 不靠任何 resolver，直接從資料庫算出 naive.ts 應該發出幾句：1（訂單）+ N（顧客）+ N（品項）+ 這 N 張訂單的品項數（商品）
async function expected(pg: { query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }, n: number) {
  const { rows } = await pg.query<{ items: number }>(
    'SELECT count(*)::int AS items FROM order_items WHERE order_id IN (SELECT id FROM orders ORDER BY ordered_at DESC, id DESC LIMIT $1)', [n])
  return 1 + n + n + rows[0].items
}

test('countQueries 回傳一次請求發出的 SQL 句數（N = 5、20、37，每次重新計數）', opts, async () => {
  const { db, pg } = rand
  const yoga = buildYoga(db, { resolvers: naiveResolvers, context: () => ({ db }) })
  for (const n of [5, 20, 37]) {
    const want = await expected(pg, n)
    assert.equal(await countQueries(yoga, db, QUERY, { n }), want, `查 ${n} 張訂單時應該是 1 + ${n} + ${n} + 品項數 = ${want} 句：用 yoga.fetch 送出查詢（variables 也要送），回傳 db.log 的句數`)
  }
  const want = await expected(pg, 5)
  assert.equal(await countQueries(yoga, db, QUERY, { n: 5 }), want, '連續呼叫兩次，第二次的數字變大了：每次計數前先把 db.log 清空（db.log.length = 0），或記下開始時的長度再相減')
})

test('UPDATE 也算一句 SQL', opts, async () => {
  const { db } = rand
  const yoga = buildYoga(db, { resolvers: naiveResolvers, context: () => ({ db }) })
  const n = await countQueries(yoga, db, 'mutation { updatePrice(productId: "2", price: 115) { price } }')
  assert.equal(n, 1, 'naive.ts 的 updatePrice 發出 1 句 UPDATE：db.log 裡的每一句都要算，不要只算 SELECT')
})

test('查詢有錯時丟錯，不回傳一個不可信的數字', opts, async () => {
  const { db } = rand
  const yoga = buildYoga(db, { resolvers: naiveResolvers, context: () => ({ db }) })
  await assert.rejects(countQueries(yoga, db, '{ orders(last: 3) { nmae } }'), '回應有 errors（例如欄位拼錯）時要丟錯：查詢根本沒執行，0 句不代表沒有 N+1')
})

test('notes.md 填入 N=20 時 naive.ts 的實際句數', opts, async () => {
  const text = readFileSync(new URL('./notes.md', import.meta.url), 'utf8')
  const m = text.match(/N=20 的 SQL 句數[:：]\s*(\d+)/)
  assert.ok(m, 'notes.md 最後一行「N=20 的 SQL 句數：」後面要填一個數字')
  const want = await expected(fixed.pg, 20)
  assert.equal(Number(m[1]), want, `notes.md 的數字不對：執行 node examples/measure.ts 看實際句數（資料庫是 8 張原本的訂單加 40 張隨機訂單）`)
})
