// 練習 3：用 migration 加索引
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { resetDb } from '../../helpers/db.ts'

const { PrismaClient } = await import('./src/generated/prisma/client.js')
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
afterAll(() => prisma.$disconnect())

type Index = { name: string; tbl: string; cols: string[]; valid: boolean }
let indexes: Index[] = []
beforeAll(async () => {
  // 判分資料庫是全新建立、只套用 prisma/migrations/ 的：手動在 psql 建的索引不會在這裡
  indexes = await prisma.$queryRawUnsafe<Index[]>(`
    SELECT i.relname AS name, t.relname AS tbl, x.indisvalid AS valid,
           array_agg(a.attname::text ORDER BY k.ord) AS cols
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    CROSS JOIN LATERAL unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE t.relname IN ('orders', 'order_items') AND NOT x.indisprimary
    GROUP BY i.relname, t.relname, x.indisvalid`)
})

const list = () => indexes.map(i => `${i.tbl}(${i.cols.join(', ')})`).join('、') || '（沒有）'
const composite = () => indexes.find(i => i.tbl === 'orders' && i.cols[0] === 'customer_id' && i.cols[1] === 'ordered_at')

describe('練習 3：索引', () => {
  it('orders 有 (customer_id, ordered_at) 的複合索引', () => {
    expect(composite(), `套用你的 migration 之後找不到 orders(customer_id, ordered_at)。現有的索引：${list()}。在 schema.prisma 的 Order 加 @@index([customerId, orderedAt])（順序：先等值篩選的欄位、再排序的欄位），再用 npx prisma migrate dev 產生 migration`).toBeDefined()
    expect(composite()!.valid, '索引是 INVALID（建立失敗留下的）').toBe(true)
  })

  it('order_items 有 order_id 的索引（外鍵不會自動建索引）', () => {
    expect(indexes.some(i => i.tbl === 'order_items' && i.cols[0] === 'order_id'), `找不到 order_items(order_id)。現有的索引：${list()}。PostgreSQL 只替被參照的一方（主鍵）建索引，外鍵欄位要自己加`).toBe(true)
  })

  it('索引寫在 schema.prisma（schema 和 migration 要一致）', () => {
    const schema = readFileSync(join(import.meta.dirname, 'prisma/schema.prisma'), 'utf8').replace(/\/\/.*$/gm, '')
    expect(schema, 'schema.prisma 的 Order 沒有 @@index([customerId, orderedAt])：只改 migration.sql 的話，下次 npx prisma migrate dev 會以為索引是多的，產生一個把它刪掉的 migration').toMatch(/@@index\(\s*(fields:\s*)?\[\s*customerId\s*,\s*orderedAt\b/)
    expect(schema, 'schema.prisma 的 OrderItem 沒有 @@index([orderId])').toMatch(/@@index\(\s*(fields:\s*)?\[\s*orderId\b/)
  })

  it('資料多的時候，「某位顧客的訂單、由新到舊」會用到這個索引', async () => {
    await resetDb(prisma)
    await prisma.$executeRawUnsafe(`INSERT INTO customers (name, phone) SELECT '顧客' || i, '09' || lpad(i::text, 8, '0') FROM generate_series(1, 1000) AS i`)
    await prisma.$executeRawUnsafe(`INSERT INTO orders (customer_id, total, ordered_at)
      SELECT (i % 1000) + 1, 100, timestamptz '2026-01-01 00:00:00+08' + i * interval '5 minutes' FROM generate_series(1, 50000) AS i`)
    await prisma.$executeRawUnsafe(`ANALYZE orders`)
    const [{ 'QUERY PLAN': plan }] = await prisma.$queryRawUnsafe<{ 'QUERY PLAN': unknown }[]>(`EXPLAIN (FORMAT JSON)
      SELECT id, total, ordered_at FROM orders WHERE customer_id = 7 ORDER BY ordered_at DESC, id DESC LIMIT 11`)
    const text = JSON.stringify(plan)
    expect(composite(), '先完成上一個測試的複合索引').toBeDefined()
    expect(text, `執行計畫沒有用到 ${composite()?.name}：\n${text.slice(0, 600)}`).toContain(`"Index Name":"${composite()!.name}"`)
  }, 60_000)
})
