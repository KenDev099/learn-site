import test from 'node:test'
import assert from 'node:assert/strict'
import DataLoader from 'dataloader'
import { createDb, type Db, type Row } from '../../helpers/db.ts'
import { mulberry32, shuffle } from '../../helpers/coffee.ts'
import { gql, quietYogaLogs } from '../../helpers/graphql.ts'
import { buildYoga } from './server.ts'
import { naiveResolvers } from './naive.ts'
import { createLoaders } from './loaders.ts'

const opts = { timeout: 10_000 }
quietYogaLogs()
const random = mulberry32(Date.now())
// 建資料庫要幾秒，放在測試外面先建好（不算進每個測試的逾時）。other 的王小明改名成王大明，用來分辨 loader 查的是哪個資料庫
const big = await createDb({ orders: 45, seed: Date.now() })
const other = await createDb({ sql: [`UPDATE customers SET name = '王大明' WHERE id = 1`] })
const QUERY = 'query ($n: Int!) { orders(last: $n) { id orderedAt total customer { id name } items { quantity unitPrice product { id name price category } } } }'

// 沒寫 ORDER BY 的查詢，資料庫本來就不保證順序：測試把這種查詢的結果打亂，batch 函式要依 key 對回去
function shuffled(db: Db): Db {
  return { ...db, query: async <T extends Row>(sql: string, params?: unknown[]) => {
    const rows = await db.query<T>(sql, params)
    return /order\s+by/i.test(sql) ? rows : shuffle(rows, random)
  } }
}

test('createLoaders 每次呼叫都建立新的 loader，用傳進來的 db', opts, async () => {
  const a = big, b = other
  const la = createLoaders(a.db), lb = createLoaders(b.db)
  for (const k of ['customerById', 'productById', 'itemsByOrderId'] as const)
    assert.ok(la[k] instanceof DataLoader, `${k} 要是 new DataLoader(…)`)
  for (const k of ['customerById', 'productById', 'itemsByOrderId'] as const)
    assert.ok(la[k] !== lb[k], `兩次 createLoaders 回傳同一個 ${k}：loader 不能存在模組變數裡，每次呼叫都 new 一個`)
  assert.equal((await la.customerById.load(1))?.name, '王小明')
  assert.equal((await lb.customerById.load(1))?.name, '王大明', 'loader 要用傳進 createLoaders 的那個 db 查詢')
})

test('batch 函式：一句 SQL、依 keys 的順序回傳、找不到放 null', opts, async () => {
  const { db, log } = big
  const loaders = createLoaders(shuffled(db))
  log.length = 0
  const ids = shuffle([1, 2, 3, 4, 5, 6], random)
  const missing = 900 + Math.floor(random() * 90)
  const keys = [ids[0], missing, ids[1], ids[2], ids[0]]
  const customers = await loaders.customerById.loadMany(keys)
  assert.equal(log.length, 1, `5 次 load 應該只發出 1 句 SQL，實際 ${log.length} 句：batch 函式用 WHERE id = ANY($1) 一次查完，不要對每個 key 各查一次`)
  assert.ok(!customers.some(c => c instanceof Error), `有 load 失敗：${customers.find(c => c instanceof Error)}。batch 函式回傳的陣列長度要等於 keys 的長度`)
  assert.deepEqual(customers.map(c => (c as { id: number } | null)?.id ?? null), [ids[0], null, ids[1], ids[2], ids[0]],
    `customerById.loadMany(${JSON.stringify(keys)}) 的結果位置不對：資料庫回傳的順序不固定，用 Map 依 id 對回 keys 的順序，找不到的放 null`)
  assert.equal(customers[1], null, `找不到的 id ${missing} 拿到 ${String(customers[1])}：要明確放 null（Map 的 get 找不到時是 undefined，用 ?? null）`)

  log.length = 0
  const products = await loaders.productById.loadMany([ids[3], missing + 1, ids[4]])
  assert.equal(log.length, 1, 'productById 也只能發出 1 句 SQL')
  assert.deepEqual(products.map(p => p instanceof Error ? 'Error' : p?.id ?? null), [ids[3], null, ids[4]], 'productById 要依 keys 的順序回傳，找不到放 null')
})

test('itemsByOrderId 回傳陣列的陣列（依 product_id 排序，沒有品項的放 []）', opts, async () => {
  const { db, pg, log } = big
  const loaders = createLoaders(shuffled(db))
  log.length = 0
  const orderIds = shuffle(Array.from({ length: 20 }, (_, i) => i + 1), random).slice(0, 6)
  const keys = [...orderIds, 999]
  const got = await Promise.all(keys.map(id => loaders.itemsByOrderId.load(id)))
  assert.equal(log.length, 1, 'itemsByOrderId 7 次 load 只能發出 1 句 SQL')
  const { rows } = await pg.query<any>('SELECT order_id, product_id, quantity, unit_price FROM order_items ORDER BY order_id, product_id')
  const want = keys.map(id => rows.filter(r => r.order_id === id))
  assert.ok(got.every(Array.isArray), 'itemsByOrderId 每個 key 要拿到一個陣列（這張訂單的品項），不是單一品項')
  assert.deepEqual(got.map(list => list.map(r => r.product_id)), want.map(list => list.map(r => r.product_id)),
    '每張訂單要拿到自己的品項、依 product_id 由小到大；不存在的訂單拿到 []')
  assert.deepEqual(JSON.parse(JSON.stringify(got)), want, '品項的欄位要有 order_id、product_id、quantity、unit_price')
})

test('同一份查詢（37 張訂單）只發出 4 句 SQL，結果跟 naive.ts 一樣', opts, async () => {
  const { db, log } = big
  const naive = buildYoga(db, { resolvers: naiveResolvers, context: () => ({ db }) })
  const want = await gql(naive, QUERY, { n: 37 })
  const fast = shuffled(db)
  const yoga = buildYoga(fast, { context: () => ({ db: fast, loaders: createLoaders(fast) }) })
  log.length = 0
  const { body } = await gql(yoga, QUERY, { n: 37 })
  assert.equal(body.errors, undefined, `不應該有錯誤：${body.errors?.[0]?.message}`)
  assert.deepEqual(body.data, want.body.data, '結果要跟 naive.ts 完全一樣（包括品項的順序、找不到時的 null）')
  assert.equal(log.length, 4, `應該是 4 句 SQL（訂單、顧客、品項、商品各一句），實際 ${log.length} 句：\n${[...new Set(log)].join('\n')}\nOrder.customer、Order.items、OrderItem.product 都要改用 ctx.loaders`)
})

test('Query.product 也用 productById', opts, async () => {
  const { db, log } = big
  const yoga = buildYoga(db, { context: () => ({ db, loaders: createLoaders(db) }) })
  const id = 1 + Math.floor(random() * 6)
  log.length = 0
  const { body } = await gql(yoga, `{ a: product(id: "${id}") { name } b: product(id: "${id}") { price } c: product(id: "77") { name } }`)
  assert.equal(body.errors, undefined, `不應該有錯誤：${body.errors?.[0]?.message}`)
  assert.equal(body.data.c, null, '不存在的商品回 null')
  assert.equal(log.length, 1, `三個 product 欄位應該合成 1 句 SQL，實際 ${log.length} 句：Query.product 改用 ctx.loaders.productById.load(Number(args.id))`)
})
