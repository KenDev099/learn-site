// 練習 2：用 --create-only 產生新的 migration，手寫 CHECK (price >= 0)
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

const dir = join(import.meta.dirname, 'prisma/migrations')
const migrations = readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
const sql = (name: string) => readFileSync(join(dir, name, 'migration.sql'), 'utf8').replace(/--.*$/gm, '')

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
beforeAll(() => db.connect())
afterAll(() => db.end())

async function insertPrice(price: number) {
  await db.query('BEGIN')
  try {
    const { rows: [c] } = await db.query(`INSERT INTO categories (name) VALUES ('練習 2 分類') RETURNING id`)
    await db.query(`INSERT INTO products (name, price, category_id) VALUES ('練習 2 商品', $1, $2)`, [price, c.id])
    return null
  } catch (e) {
    return e as { code?: string }
  } finally {
    await db.query('ROLLBACK')
  }
}

describe('練習 2：價格不能是負數', () => {
  it('CHECK 寫在新的 migration，不改已經套用過的 init', () => {
    expect(migrations.length, '要有第二個 migration：npx prisma migrate dev --create-only --name price_check').toBeGreaterThanOrEqual(2)
    expect(sql(migrations[0]), `不要改已經套用過的 ${migrations[0]}：別人的資料庫已經跑過它，不會再跑一次。把 CHECK 寫在新的 migration`).not.toMatch(/\bCHECK\b/i)
    expect(migrations.slice(1).some(m => /\bCHECK\b/i.test(sql(m))), '新的 migration.sql 裡要有 ALTER TABLE "products" ADD CONSTRAINT … CHECK ("price" >= 0)').toBe(true)
  })

  it('資料庫擋下負的價格（SQLSTATE 23514）', async () => {
    const { rows } = await db.query(`SELECT 1 FROM pg_constraint WHERE contype = 'c' AND conrelid = 'public.products'::regclass`)
    expect(rows.length, 'products 上要有 CHECK 約束：ALTER TABLE "products" ADD CONSTRAINT … CHECK (…)').toBeGreaterThan(0)
    for (const price of [-1, -80]) {
      const err = await insertPrice(price)
      expect(err?.code, `直接用 SQL 新增 price = ${price} 要失敗：條件要擋下所有負數（price >= 0），只在 DTO 驗證擋不住別的程式或手動執行的 SQL`).toBe('23514')
    }
  })

  it('價格 0 可以（免費招待）', async () => {
    expect(await insertPrice(0), 'price = 0 要能新增：條件是 price >= 0，不是 > 0').toBeNull()
  })
})
