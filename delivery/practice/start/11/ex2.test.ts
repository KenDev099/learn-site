// 練習 2：orders(status, ordered_at) 索引，用 CREATE INDEX CONCURRENTLY 的新 migration
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const dir = import.meta.dirname
const migrations = join(dir, 'api/prisma/migrations')
// 起始版本就有的 migration：已經套用到正式環境，不能改，新的索引要放在新的資料夾
const EXISTING = ['20261102000000_init', '20261102000100_products_legacy_sku', '20261103000000_pickup_at', '20261103000100_pickup_slots',
  '20261108000000_payments_points', '20261109000000_point_repair', '20261110000000_sdk_rollout']
const BOARD_SQL = `SELECT * FROM orders WHERE status IN ('paid', 'preparing') ORDER BY ordered_at, id`
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })

const stripComments = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
type Plan = { 'Node Type': string, 'Relation Name'?: string, 'Index Name'?: string, Plans?: Plan[] }
const nodes = (p: Plan): Plan[] => [p, ...(p.Plans ?? []).flatMap(nodes)]

beforeAll(async () => {
  await db.connect()
  // 判分資料庫放進正式環境的量：20 萬張已取餐的舊訂單＋ 40 張進行中的
  await db.query('TRUNCATE orders RESTART IDENTITY CASCADE')
  await db.query(`INSERT INTO orders (customer_id, status, total, ordered_at)
    SELECT 1 + g % 6, 'picked_up', 110, timestamptz '2026-11-09 00:00Z' - interval '1 minute' * g FROM generate_series(1, 200000) g`)
  await db.query(`INSERT INTO orders (customer_id, status, total, ordered_at)
    SELECT 1 + g % 6, CASE WHEN g % 2 = 0 THEN 'paid' ELSE 'preparing' END, 110, timestamptz '2026-11-09 00:00Z' + interval '1 minute' * g FROM generate_series(1, 40) g`)
  await db.query('ANALYZE orders')
})
afterAll(() => db.end())

describe('練習 2：看板查詢的索引', () => {
  it('新的 migration 用 CREATE INDEX CONCURRENTLY 建 orders_status_ordered_at_idx，不改既有的 migration', () => {
    const added = readdirSync(migrations, { withFileTypes: true }).filter(d => d.isDirectory() && !EXISTING.includes(d.name)).map(d => d.name)
    const files = added.map(name => ({ name, sql: stripComments(readFileSync(join(migrations, name, 'migration.sql'), 'utf8')) }))
    const hit = files.find(f => /orders_status_ordered_at_idx/.test(f.sql))
    expect(hit, `在 api/prisma/migrations/ 新增一個資料夾（例如 20261111000000_orders_status_index/migration.sql），建立索引 orders_status_ordered_at_idx。新增的資料夾：${added.join('、') || '（沒有）'}`).toBeDefined()
    expect(/CREATE\s+INDEX\s+CONCURRENTLY/i.test(hit!.sql), `${hit!.name}/migration.sql 要用 CREATE INDEX CONCURRENTLY：一般的 CREATE INDEX 建索引的整段時間會擋住 orders 的寫入（不能下單）`).toBe(true)
    for (const name of EXISTING) {
      expect(readFileSync(join(migrations, name, 'migration.sql'), 'utf8').includes('orders_status_ordered_at_idx'), `不要改已經套用過的 migration（${name}）：正式環境不會再跑一次，索引要放在新的 migration`).toBe(false)
    }
  })

  it('schema.prisma 的 Order 也宣告了這個索引（@@index([status, orderedAt])），下次產生 migration 才不會把它刪掉', () => {
    const schema = readFileSync(join(dir, 'api/prisma/schema.prisma'), 'utf8')
    const order = schema.match(/model\s+Order\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(/@@index\(\s*\[\s*status\s*,\s*orderedAt\s*\]/.test(stripComments(order).replace(/\/\/.*$/gm, '')), 'model Order 裡要加 @@index([status, orderedAt])：schema 和資料庫不一致時，下一次 prisma migrate dev 會產生 DROP INDEX').toBe(true)
  })

  it('索引的欄位是 (status, ordered_at)，而且是有效的', async () => {
    const { rows } = await db.query(`SELECT pg_get_indexdef(i.indexrelid) AS def, i.indisvalid AS valid
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = 'orders_status_ordered_at_idx'`)
    expect(rows.length, '判分資料庫裡沒有 orders_status_ordered_at_idx：migration 沒有建出這個名稱的索引').toBe(1)
    expect(rows[0].def, '欄位順序是 (status, ordered_at)：先用等號／IN 篩選的欄位在前，排序的欄位在後').toMatch(/\(status, ordered_at\)/)
    expect(rows[0].valid, '索引是 INVALID（建到一半失敗）').toBe(true)
  })

  it('20 萬筆訂單時，看板的查詢用到這個索引，不再整張表掃描', async () => {
    const plan: Plan = (await db.query(`EXPLAIN (FORMAT JSON) ${BOARD_SQL}`)).rows[0]['QUERY PLAN'][0].Plan
    const all = nodes(plan)
    expect(all.some(n => n['Node Type'] === 'Seq Scan' && n['Relation Name'] === 'orders'), '看板的查詢還是 Seq Scan on orders（整張表掃描）').toBe(false)
    expect(all.some(n => n['Index Name'] === 'orders_status_ordered_at_idx'), `看板的查詢沒有用到 orders_status_ordered_at_idx，用的是：${all.map(n => n['Index Name'] ?? n['Node Type']).join(' → ')}`).toBe(true)
  })
})
