import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSchema } from 'graphql'
import { readFileSync } from 'node:fs'
import { mulberry32 } from '../../helpers/coffee.ts'
import { createDb } from '../../helpers/db.ts'
import { gql } from '../../helpers/graphql.ts'
import { buildYoga } from './server.ts'

const opts = { timeout: 10_000 }
const random = mulberry32(Date.now())

// 90 張隨機訂單（每次執行不同）；挑一位訂單數 12–50 張的顧客
const { db, pg, log } = await createDb({ orders: 90, seed: Math.floor(random() * 1e9) })
const counts = (await pg.query<{ customer_id: number, n: number }>(
  'SELECT customer_id, count(*)::int AS n FROM orders GROUP BY customer_id HAVING count(*) BETWEEN 12 AND 50 ORDER BY customer_id')).rows
const customerId = String(counts[Math.floor(random() * counts.length)].customer_id)

// 讓這位顧客的訂單每 3 張同一個時間（同一秒成立的訂單），換頁的邊界一定會落在同時間的訂單中間
const mine = (await pg.query<{ id: number, ordered_at: Date }>(
  'SELECT id, ordered_at FROM orders WHERE customer_id = $1 ORDER BY ordered_at, id', [customerId])).rows
const values = mine.map((o, i) => `(${o.id}, '${mine[i - (i % 3)].ordered_at.toISOString()}')`).join(',')
await pg.exec(`UPDATE orders o SET ordered_at = v.t::timestamptz FROM (VALUES ${values}) AS v(id, t) WHERE o.id = v.id`)

// 記下每一句 SQL 拿回幾列：擋下「全部查出來再用 JS 切」的寫法
const rowCounts: number[] = []
const yoga = buildYoga({ ...db, query: async (sql: string, params?: unknown[]) => {
  const rows = await db.query(sql, params)
  if (/\bfrom\s+orders\b/i.test(sql)) rowCounts.push(rows.length)
  return rows
} } as typeof db)
const expected = async () => (await pg.query<{ id: number }>(
  'SELECT id FROM orders WHERE customer_id = $1 ORDER BY ordered_at DESC, id DESC', [customerId])).rows.map(r => String(r.id))

const PAGE = `query ($id: ID!, $first: Int, $after: String) {
  customer(id: $id) { orders(first: $first, after: $after) { edges { cursor node { id orderedAt total } } pageInfo { hasNextPage endCursor } } }
}`
type Page = { edges: { cursor: string, node: { id: string } }[], pageInfo: { hasNextPage: boolean, endCursor: string | null } }
async function page(variables: Record<string, unknown>) {
  log.length = 0
  rowCounts.length = 0
  const res = await gql(yoga, PAGE, { id: customerId, ...variables })
  const orderSql = log.filter(s => /\bfrom\s+orders\b/i.test(s))
  return { ...res, orderSql, conn: res.body.data?.customer?.orders as Page | undefined }
}
const errorText = (b: { errors?: { message: string, extensions?: Record<string, any> }[] }) =>
  b.errors?.map(e => `${e.message}（${e.extensions?.code}）`).join('；')

test('schema.graphql 照 Relay 的 Connection 慣例', opts, () => {
  const schema = buildSchema(readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8'))
  const field = (type: string, name: string) => {
    const t = schema.getType(type) as any
    assert.ok(t?.getFields, `schema 裡要有 type ${type}`)
    const f = t.getFields()[name]
    assert.ok(f, `${type} 要有欄位 ${name}`)
    return f
  }
  const orders = field('Customer', 'orders')
  assert.equal(String(orders.type), 'OrderConnection!', 'Customer.orders 的型別要是 OrderConnection!（一定回傳一個 connection，沒有資料時 edges 是空陣列）')
  const arg = (n: string) => orders.args.find((a: { name: string }) => a.name === n)
  assert.equal(String(arg('first')?.type), 'Int', 'Customer.orders 要有參數 first: Int（可以不給，預設 10）')
  assert.equal(String(arg('after')?.type), 'String', 'Customer.orders 要有參數 after: String（第一頁不給）')
  assert.equal(String(field('OrderConnection', 'edges').type), '[OrderEdge!]!', 'OrderConnection.edges 要是 [OrderEdge!]!')
  assert.equal(String(field('OrderConnection', 'pageInfo').type), 'PageInfo!', 'OrderConnection.pageInfo 要是 PageInfo!')
  assert.equal(String(field('OrderEdge', 'cursor').type), 'String!', 'OrderEdge.cursor 要是 String!')
  assert.equal(String(field('OrderEdge', 'node').type), 'Order!', 'OrderEdge.node 要是 Order!')
  assert.equal(String(field('PageInfo', 'hasNextPage').type), 'Boolean!', 'PageInfo.hasNextPage 要是 Boolean!')
  assert.equal(String(field('PageInfo', 'endCursor').type), 'String', 'PageInfo.endCursor 要是 String（沒有資料時是 null）')
})

test('逐頁翻完：不重複、不遺漏、由新到舊；翻到一半有新訂單也不會重複', opts, async () => {
  const want = await expected()
  const first = 4 + Math.floor(random() * 2)   // 4 或 5：不是 3 的倍數，邊界會切在同時間的訂單中間
  const seen: string[] = []
  let after: string | null = null
  for (let n = 1; n <= 60; n++) {
    const { body, orderSql, conn } = await page({ first, after })
    assert.equal(body.errors, undefined, `第 ${n} 頁不應該有錯誤：${errorText(body)}`)
    assert.ok(conn, '要回傳 customer.orders')
    assert.equal(orderSql.length, 1, `每一頁只能有一句查 orders 的 SQL（現在 ${orderSql.length} 句）：用 LIMIT first + 1 一次拿完，多的那一筆用來判斷 hasNextPage`)
    assert.ok(rowCounts[0] <= first + 1, `first: ${first} 時資料庫只該回傳 ${first + 1} 列（現在回了 ${rowCounts[0]} 列）：在 SQL 用 LIMIT first + 1，不要全部查出來再用 JS 切`)
    assert.doesNotMatch(orderSql[0], /\boffset\b/i, '不要用 OFFSET：前面多一張訂單，整頁就往後移一格。用 WHERE (ordered_at, id) < (…) 從游標之後開始')
    assert.ok(conn.edges.length <= first, `first: ${first} 時一頁最多 ${first} 筆，拿到 ${conn.edges.length} 筆`)
    assert.equal(conn.pageInfo.endCursor, conn.edges.at(-1)?.cursor ?? null, 'pageInfo.endCursor 要是這一頁最後一筆的 cursor（沒有資料時是 null）')
    for (const e of conn.edges) assert.notEqual(e.cursor, e.node.id, '游標不能直接是訂單 id（用練習 1 的 encodeCursor）')
    seen.push(...conn.edges.map(e => e.node.id))
    // 第一頁之後，這位顧客剛好又下了一張新訂單（比所有訂單都新）
    if (n === 1) await pg.query("INSERT INTO orders (customer_id, ordered_at, total) VALUES ($1, now() + interval '1 day', 80)", [customerId])
    if (!conn.pageInfo.hasNextPage) break
    assert.ok(conn.edges.length === first, `hasNextPage 是 true 時這一頁應該是滿的（${first} 筆），拿到 ${conn.edges.length} 筆`)
    after = conn.pageInfo.endCursor
  }
  const dup = seen.filter((id, i) => seen.indexOf(id) !== i)
  assert.deepEqual(dup, [], `訂單 ${dup.join('、')} 出現了兩次：翻頁途中有新訂單時，用 OFFSET 會把上一頁看過的再拿一次`)
  const missing = want.filter(id => !seen.includes(id))
  assert.deepEqual(missing, [], `漏掉了訂單 ${missing.join('、')}：同一時間有好幾張訂單時，只比 ordered_at 會把邊界上的跳過。排序與比較都要用 (ordered_at, id)`)
  assert.deepEqual(seen, want, '順序要是 ordered_at DESC, id DESC（同時間的訂單 id 大的在前）')
})

test('first 預設 10；剛好整除時最後一頁的 hasNextPage 是 false', opts, async () => {
  const want = await expected()
  const def = await page({})
  assert.equal(def.body.errors, undefined, `不應該有錯誤：${errorText(def.body)}`)
  assert.deepEqual(def.conn!.edges.map(e => e.node.id), want.slice(0, 10), '沒給 first 時回傳最新的 10 筆（schema 寫 first: Int = 10，或程式裡 first ?? 10）')
  assert.equal(def.conn!.pageInfo.hasNextPage, true, `這位顧客有 ${want.length} 張訂單，10 筆之後還有下一頁`)
  const all = await page({ first: want.length })
  assert.equal(all.conn!.edges.length, want.length, `first: ${want.length} 要拿到全部 ${want.length} 筆`)
  assert.equal(all.conn!.pageInfo.hasNextPage, false, `顧客剛好有 ${want.length} 張訂單、first: ${want.length} 時已經拿完，hasNextPage 要是 false。用「多拿一筆」判斷，不要用 rows.length === first`)
  const less = await page({ first: want.length - 1 })
  assert.equal(less.conn!.pageInfo.hasNextPage, true, `first: ${want.length - 1} 時還剩 1 筆，hasNextPage 要是 true`)
})

test('first 超過 50 或是負數、after 是壞掉的游標：回 BAD_USER_INPUT，不查訂單', opts, async () => {
  for (const [label, vars] of [['first: 51', { first: 51 }], ['first: 100000', { first: 100000 }], ['first: -5', { first: -5 }], ['after: "%%%"', { after: '%%%' }]] as const) {
    const { status, body, orderSql } = await page(vars)
    assert.equal(status, 200, `${label}：執行階段的錯誤，HTTP 狀態仍是 200`)
    assert.equal(body.errors?.[0]?.extensions?.code, 'BAD_USER_INPUT',
      `${label}：要回 GraphQLError，extensions.code 是 BAD_USER_INPUT（現在：${errorText(body) ?? '沒有錯誤'}）。first 要限制在 0–50，不然一個請求就能叫資料庫查十萬筆`)
    assert.equal(orderSql.length, 0, `${label}：參數不合法時在查資料庫之前就擋下`)
  }
})
