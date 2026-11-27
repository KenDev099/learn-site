// 練習 1：Category 與 Product model，用 migrate dev 產生 migration
// check.mjs 已經用你的 prisma/migrations 重建了判分資料庫（prisma migrate deploy），這裡檢查建出來的表長什麼樣
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import pg from 'pg'

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
beforeAll(() => db.connect())
afterAll(() => db.end())

async function columns(table: string) {
  const { rows } = await db.query<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
    `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [table])
  return Object.fromEntries(rows.map(r => [r.column_name, r]))
}

async function uniqueOn(table: string, column: string) {
  const { rows } = await db.query(
    `SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = $1::regclass AND i.indisunique AND i.indnatts = 1 AND a.attname = $2`, [`public.${table}`, column])
  return rows.length > 0
}

describe('練習 1：categories 與 products 資料表', () => {
  it('categories：id 與 name（唯一）', async () => {
    const cols = await columns('categories')
    expect(Object.keys(cols), '找不到資料表 categories：model Category 要加 @@map("categories")，再執行 npx prisma migrate dev --name init').not.toHaveLength(0)
    expect(cols.id?.data_type, 'categories.id 要是 Int @id @default(autoincrement())（integer）').toBe('integer')
    expect(cols.id?.column_default ?? '', 'categories.id 要自動編號：@default(autoincrement())').toMatch(/nextval/)
    expect(cols.name?.data_type, 'categories.name 要是 String（text）').toBe('text')
    expect(cols.name?.is_nullable, 'categories.name 不能是 NULL：不要加 ?').toBe('NO')
    expect(await uniqueOn('categories', 'name'), 'categories.name 要加 @unique').toBe(true)
  })

  it('products：欄位名稱是 snake_case，型別正確', async () => {
    const cols = await columns('products')
    expect(Object.keys(cols), '找不到資料表 products：model Product 要加 @@map("products")').not.toHaveLength(0)
    expect(Object.keys(cols).sort(), '欄位要是 id、name、price、is_available、category_id、created_at：TypeScript 那邊用 camelCase，用 @map("is_available") 這類寫法對應到 snake_case 欄位').toEqual(['category_id', 'created_at', 'id', 'is_available', 'name', 'price'])
    expect(cols.id.data_type, 'products.id 要是 Int @id @default(autoincrement())（integer）').toBe('integer')
    expect(cols.id.column_default ?? '', 'products.id 要自動編號：@default(autoincrement())').toMatch(/nextval/)
    expect(cols.price.data_type, 'price 要是 Int（integer）：金額用整數「元」，不要用 Float 或 Decimal').toBe('integer')
    expect(cols.is_available.data_type, 'is_available 要是 Boolean').toBe('boolean')
    expect(cols.is_available.column_default, 'is_available 預設 true：@default(true)').toBe('true')
    expect(cols.created_at.data_type, 'created_at 要是 timestamptz：DateTime 預設是 timestamp(3)（沒有時區），要加 @db.Timestamptz(3)').toBe('timestamp with time zone')
    expect(cols.created_at.column_default ?? '', 'created_at 預設現在時間：@default(now())').toMatch(/CURRENT_TIMESTAMP|now\(\)/i)
    for (const c of ['name', 'price', 'is_available', 'category_id', 'created_at']) {
      expect(cols[c].is_nullable, `products.${c} 不能是 NULL：型別後面不要加 ?`).toBe('NO')
    }
    expect(await uniqueOn('products', 'name'), 'products.name 要加 @unique').toBe(true)
  })

  it('products.category_id 是指向 categories 的外鍵', async () => {
    const { rows } = await db.query(
      `SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
       WHERE c.contype = 'f' AND c.conrelid = 'public.products'::regclass AND c.confrelid = 'public.categories'::regclass AND a.attname = 'category_id'`)
    expect(rows.length, 'Product 要有 category Category @relation(fields: [categoryId], references: [id])，Category 那邊要有 products Product[]').toBe(1)
  })

  it('migration 和 schema.prisma 一致（改完 schema 有再執行 migrate dev）', () => {
    const r = spawnSync(join(import.meta.dirname, '../../node_modules/.bin/prisma'),
      ['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'],
      { cwd: import.meta.dirname, encoding: 'utf8', env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' } })
    expect(r.status, `用 migration 建出來的資料庫跟 schema.prisma 不一樣：schema 改過之後要再執行 npx prisma migrate dev（db push 不會留下 migration）。差異：\n${r.stdout}${r.stderr}`).toBe(0)
  })
})
