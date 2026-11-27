import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import type pg from 'pg'
import { COFFEE_SQL, createTestDb } from '../../helpers/db.ts'
import { ValidationError } from './errors.ts'

const opts = { timeout: 15_000 }
type Search = (pool: pg.Pool, o: { q: string, sort?: string, limit?: number }) =>
  Promise<{ items: { id: number, name: string, price: number }[], total: unknown }>

const { pool } = await createTestDb([COFFEE_SQL, join(import.meta.dirname, 'schema.sql')])

// 每次執行都用隨機的品名，寫死的答案對不上
const tag = `k${randomBytes(3).toString('hex')}`   // 開頭一定是英文字母，大小寫不同才測得出 ILIKE
const NAMES = [`${tag} 100% 哥倫比亞`, `${tag} 1000 綜合豆`, `${tag} 季節_特調`, `${tag} 季節A特調`, `${tag} 路徑\\豆`, `${tag} 路徑豆`]
const ids: Record<string, number> = {}
for (const [i, name] of NAMES.entries()) {
  ids[name] = (await pool.query<{ id: number }>('INSERT INTO products (name, price) VALUES ($1, $2) RETURNING id', [name, 150 + i])).rows[0].id
}

async function load() {
  const mod: { searchProducts?: unknown } = await import('./products.ts')
  assert.equal(typeof mod.searchProducts, 'function', 'products.ts 要 export searchProducts(pool, options)')
  return mod.searchProducts as Search
}
const names = (r: { items: { name: string }[] }) => r.items.map(p => p.name).sort()

test('不分大小寫的模糊搜尋，total 是 number', opts, async () => {
  const search = await load()
  const r = await search(pool, { q: '拿鐵' })
  assert.deepEqual(names(r), ['拿鐵'])
  assert.equal(r.total, 1, `total 要是 number 1，收到 ${JSON.stringify(r.total)}：count(*) 是 bigint，pg 回傳字串`)
  const all = await search(pool, { q: tag.toUpperCase(), limit: 2 })
  assert.equal(all.items.length, 2, 'limit 2 只回 2 筆')
  assert.equal(all.total, NAMES.length, `total 是符合條件的總數（${NAMES.length}），不受 limit 影響；搜尋要不分大小寫（ILIKE）`)
  assert.equal(typeof all.items[0].price, 'number', 'price 要是 number')
})

test('q 裡的 %、_、\\ 是一般字元', opts, async () => {
  const search = await load()
  assert.deepEqual(names(await search(pool, { q: `${tag} 100%` })), [`${tag} 100% 哥倫比亞`], '搜尋「100%」只能找到真的含有 100% 的品項：% 要跳脫')
  assert.deepEqual(names(await search(pool, { q: '季節_' })), [`${tag} 季節_特調`], '搜尋「季節_」只能找到含底線的：_ 要跳脫')
  assert.deepEqual(names(await search(pool, { q: '路徑\\' })), [`${tag} 路徑\\豆`], '搜尋「路徑\\」只能找到含反斜線的：\\ 也要跳脫')
  const pct = await search(pool, { q: '%' })
  assert.equal(pct.total, 1, `搜尋「%」只有一筆（含 % 的那筆），收到 ${String(pct.total)}`)
})

test('SQL injection 無效：當成一般字串搜尋', opts, async () => {
  const search = await load()
  const r = await search(pool, { q: "' OR 1=1 --" })
  assert.equal(r.items.length, 0, "q = \"' OR 1=1 --\" 要找不到任何東西：用 $1 參數，不要把 q 接進 SQL 字串")
  assert.equal(r.total, 0)
  // 記下送出去的 SQL 文字：q 只能出現在參數裡
  const texts: string[] = []
  const spy = { query: (...args: unknown[]) => {
    texts.push(typeof args[0] === 'string' ? args[0] : String((args[0] as { text?: string }).text))
    return (pool.query as (...a: unknown[]) => unknown)(...args)
  } } as unknown as pg.Pool
  const marker = `${tag}''注入`
  await search(spy, { q: marker })
  assert.ok(texts.length > 0, 'searchProducts 要用傳進來的 pool 查詢')
  assert.ok(texts.every(t => !t.includes(tag)), `q 被接進 SQL 字串了（${texts.join('；')}）：要用 $1 參數傳值，自己跳脫引號也不行`)
})

test('sort 只接受白名單，排序正確', opts, async () => {
  const search = await load()
  for (const sort of ['price; DROP TABLE products', 'price', 'id DESC', 'constructor']) {
    const err = await search(pool, { q: tag, sort }).then(() => null, (e: unknown) => e)
    assert.ok(err instanceof ValidationError, `sort = ${JSON.stringify(sort)} 要丟 ValidationError，收到 ${String(err)}`)
    assert.equal(err.field, 'sort')
  }
  const asc = (await search(pool, { q: tag, sort: 'price_asc' })).items.map(p => p.price)
  assert.deepEqual(asc, [...asc].sort((a, b) => a - b), 'price_asc 要由便宜到貴')
  const desc = (await search(pool, { q: tag, sort: 'price_desc' })).items.map(p => p.price)
  assert.deepEqual(desc, [...desc].sort((a, b) => b - a), 'price_desc 要由貴到便宜')
  const expected = (await pool.query<{ name: string }>('SELECT name FROM products WHERE name LIKE $1 ORDER BY name, id', [`${tag}%`])).rows.map(r => r.name)
  assert.deepEqual((await search(pool, { q: tag, sort: 'name' })).items.map(p => p.name), expected, 'sort = name 要依品名排序')
})

test('limit 要是 1 到 50 的整數', opts, async () => {
  const search = await load()
  for (const limit of [0, 51, 1.5, -1, Number.NaN]) {
    const err = await search(pool, { q: tag, limit }).then(() => null, (e: unknown) => e)
    assert.ok(err instanceof ValidationError, `limit = ${limit} 要丟 ValidationError，收到 ${String(err)}`)
    assert.equal(err.field, 'limit')
  }
  assert.equal((await search(pool, { q: tag, limit: 50 })).items.length, NAMES.length)
})
