// 練習 2：止血（關旗標、保留 SEC-7 的修正）與修根因（pg_trgm 的 GIN 索引，CREATE INDEX CONCURRENTLY），最後把旗標打開
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { INestApplication } from '@nestjs/common'
import pg from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './api/src/app.module.js'

const dir = import.meta.dirname
const migrations = join(dir, 'api/prisma/migrations')
// v2.8.0 為止的 migration：正式環境已經跑過，不能改
const EXISTING = ['20261102000000_init', '20261102000100_products_legacy_sku', '20261103000000_pickup_at', '20261103000100_pickup_slots',
  '20261108000000_payments_points', '20261109000000_point_repair', '20261110000000_sdk_rollout', '20261111000000_orders_status_index', '20261115000000_accounts']
const SEARCH_SQL = `SELECT id, customer_id, status, total, note, ordered_at FROM orders WHERE note ILIKE '%燕麥奶%' ORDER BY ordered_at DESC, id DESC LIMIT 20`
const stripComments = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
type Plan = { 'Node Type': string, 'Relation Name'?: string, 'Index Name'?: string, Plans?: Plan[] }
const nodes = (p: Plan): Plan[] => [p, ...(p.Plans ?? []).flatMap(nodes)]

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
let app: INestApplication
const login = async (username: string, password: string) => {
  const agent = request.agent(app.getHttpServer())
  const res = await agent.post('/auth/login').send({ username, password })
  expect(res.status, `示範帳號 ${username} 登入失敗（${res.status}）：不要改 auth 模組與種子資料的帳號`).toBe(200)
  return agent
}
const setFlag = (percent: number) => db.query(`UPDATE feature_flags SET percent = $1 WHERE key = 'orders.search'`, [percent])

beforeAll(async () => {
  process.env.SESSION_SECRET = 'grading-secret'
  await db.connect()
  app = await createTestApp(AppModule)
})
afterAll(async () => {
  await app?.close()
  await db.end()
})

describe('練習 2：止血與修復', () => {
  it('止血不能丟掉 SEC-7：沒登入 401；顧客看別人的訂單 404，看自己的 200', async () => {
    const { rows } = await db.query(`INSERT INTO orders (customer_id, total, note) VALUES (1, 110, '燕麥奶'), (2, 80, NULL) RETURNING id`)
    const [mine, theirs] = rows.map(r => r.id)
    const anonymous = await request(app.getHttpServer()).get(`/orders/${mine}`)
    expect(anonymous.status, `沒登入查訂單要回 401，現在是 ${anonymous.status}：整版回滾到 v2.7.x 會把 SEC-7（BOLA）的修正一起丟掉`).toBe(401)
    const customer1 = await login('customer1', 'latte-1')
    expect((await customer1.get(`/orders/${mine}`)).status, '顧客看自己的訂單要回 200').toBe(200)
    const other = await customer1.get(`/orders/${theirs}`)
    expect(other.status, `顧客看別人的訂單要回 404，現在是 ${other.status}：這是 v2.8.0 修好的漏洞，止血時不能讓它回來`).toBe(404)
  })

  it('旗標 orders.search 關閉時搜尋回 404，打開時正常回結果', async () => {
    const staff = await login('counter', 'barista-7')
    await setFlag(0)
    const off = await staff.get('/orders/search').query({ q: '燕麥奶' })
    expect(off.status, `旗標關閉時 GET /orders/search 要回 404，現在是 ${off.status}`).toBe(404)
    await setFlag(100)
    const on = await staff.get('/orders/search').query({ q: '燕麥奶' })
    expect(on.status, `旗標打開時店員搜尋要回 200，現在是 ${on.status}`).toBe(200)
    expect(on.body.some((o: { note: string }) => o.note === '燕麥奶'), '搜尋「燕麥奶」要找得到備註是燕麥奶的訂單').toBe(true)
  })

  it('新的 migration 先 CREATE EXTENSION pg_trgm，再用 CREATE INDEX CONCURRENTLY 建 GIN 索引；既有的 migration 不改', () => {
    const added = readdirSync(migrations, { withFileTypes: true }).filter(d => d.isDirectory() && !EXISTING.includes(d.name)).map(d => d.name)
    const sql = added.map(name => stripComments(readFileSync(join(migrations, name, 'migration.sql'), 'utf8'))).join('\n')
    expect(/CREATE\s+EXTENSION\s+(IF\s+NOT\s+EXISTS\s+)?"?pg_trgm"?/i.test(sql), `新的 migration 要有 CREATE EXTENSION IF NOT EXISTS pg_trgm（gin_trgm_ops 由它提供）。新增的資料夾：${added.join('、') || '（沒有）'}`).toBe(true)
    expect(/gin_trgm_ops/i.test(sql), '新的 migration 要建 orders(note) 的 GIN 索引，運算子類別是 gin_trgm_ops：一般的 B-tree 索引幫不了 ILIKE \'%關鍵字%\'').toBe(true)
    expect(/CREATE\s+INDEX\s+CONCURRENTLY[^;]*gin_trgm_ops/i.test(sql), '建 gin_trgm_ops 索引的那一句要用 CREATE INDEX CONCURRENTLY：一般的 CREATE INDEX 建的整段時間會擋住 orders 的寫入，事故中等於再停一次下單').toBe(true)
    for (const name of EXISTING) {
      expect(/gin_trgm_ops|pg_trgm/i.test(readFileSync(join(migrations, name, 'migration.sql'), 'utf8')), `不要改已經套用過的 migration（${name}）：正式環境不會再跑一次，索引要放在新的 migration`).toBe(false)
    }
  })

  it('索引是有效的 GIN（gin_trgm_ops）索引，而且 schema.prisma 跟資料庫一致', () => {
    const r = spawnSync(join(dir, '../../node_modules/.bin/prisma'), ['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--script'], {
      cwd: join(dir, 'api'), encoding: 'utf8', env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    })
    const diff = stripComments(r.stdout.replace(/^Loaded Prisma config.*$/m, '')).trim()
    expect(r.status === 0 && diff === '', `schema.prisma 跟資料庫不一致，下一次 prisma migrate dev 會產生這些 SQL：\n${diff || r.stderr}\n在 model Order 加上 @@index([note(ops: raw("gin_trgm_ops"))], type: Gin)，索引名稱用 Prisma 的預設 orders_note_idx`).toBe(true)
  })

  it('20 萬筆訂單時，搜尋的查詢用到新的索引，不再整張表掃描', async () => {
    const { rows } = await db.query(`SELECT c.relname, i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_opclass o ON o.oid = ANY (i.indclass)
      WHERE i.indrelid = 'orders'::regclass AND o.opcname = 'gin_trgm_ops'`)
    expect(rows.length, '判分資料庫的 orders 上沒有 gin_trgm_ops 的索引：migration 沒有建出來').toBeGreaterThan(0)
    expect(rows.every(r => r.indisvalid), '索引是 INVALID（CONCURRENTLY 建到一半失敗）：先 DROP INDEX CONCURRENTLY 再重建').toBe(true)
    await db.query(`INSERT INTO orders (customer_id, status, total, note, ordered_at)
      SELECT 1 + g % 6, 'picked_up', 110,
        CASE WHEN g % 500 = 0 THEN '燕麥奶，少冰' WHEN g % 7 = 0 THEN '少冰' WHEN g % 11 = 0 THEN '去冰半糖' WHEN g % 3 = 0 THEN NULL ELSE '外帶' END,
        timestamptz '2026-11-16 00:00Z' - interval '1 minute' * g FROM generate_series(1, 200000) g`)
    await db.query('ANALYZE orders')
    const plan: Plan = (await db.query(`EXPLAIN (FORMAT JSON) ${SEARCH_SQL}`)).rows[0]['QUERY PLAN'][0].Plan
    const all = nodes(plan)
    expect(all.some(n => n['Node Type'] === 'Seq Scan' && n['Relation Name'] === 'orders'), '搜尋的查詢還是 Seq Scan on orders（每次都讀 20 萬列）').toBe(false)
    expect(all.some(n => rows.some(r => r.relname === n['Index Name'])), `搜尋的查詢沒有用到 gin_trgm_ops 的索引，用的是：${all.map(n => n['Index Name'] ?? n['Node Type']).join(' → ')}`).toBe(true)
  })

  it('ops/flag-changes.log：事故中關掉 orders.search，索引建好之後打開（最後是開的）', () => {
    const lines = readFileSync(join(dir, 'ops/flag-changes.log'), 'utf8').trim().split('\n')
    const deployed = lines.findIndex(l => / orders\.search .*→ 100$/.test(l))
    const changes = lines.slice(deployed + 1).filter(l => / orders\.search /.test(l))
    const off = changes.findIndex(l => /→ 0$/.test(l))
    expect(off, 'ops/flag-changes.log 沒有關掉 orders.search 的紀錄：止血先執行 npm run flag -- orders.search off（會自動記一行）').toBeGreaterThanOrEqual(0)
    expect(changes.slice(off + 1).some(l => /→ 100$/.test(l)) && /→ 100$/.test(changes.at(-1)!), '關掉之後沒有再打開：索引建好、npm run db:setup 套用之後，執行 npm run flag -- orders.search on。旗標關著，功能就永遠消失了').toBe(true)
  })
})
