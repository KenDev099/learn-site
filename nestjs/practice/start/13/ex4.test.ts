// 練習 4：prisma/seed.sql 與 npx prisma db seed，可以重複執行
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import pg from 'pg'

const bin = join(import.meta.dirname, '../../node_modules/.bin')
const seed = () => spawnSync(join(bin, 'prisma'), ['db', 'seed'], {
  cwd: import.meta.dirname, encoding: 'utf8', timeout: 150_000,
  // npx 會把 node_modules/.bin 加進 PATH，這裡照做，seed 指令裡的 prisma 才找得到
  env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
})
const out = (r: ReturnType<typeof seed>) => `${r.error ? `${r.error.message}\n` : ''}${r.stdout}${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, '').trim().slice(-800)

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
beforeAll(async () => {
  await db.connect()
  await db.query('TRUNCATE products, categories RESTART IDENTITY CASCADE')
  // 模擬資料庫裡已經有別的資料：分類的 id 不會從 1 開始，寫死 category_id 的種子資料會指錯分類
  await db.query(`INSERT INTO categories (name) VALUES ('季節限定')`)
})
afterAll(() => db.end())

const byName = (a: unknown[], b: unknown[]) => String(a[0]) < String(b[0]) ? -1 : 1
const MENU = [
  ['伯爵紅茶', 90, '茶'], ['卡布奇諾', 110, '咖啡'], ['可頌', 70, '甜點'],
  ['拿鐵', 110, '咖啡'], ['美式咖啡', 80, '咖啡'], ['起司蛋糕', 120, '甜點'],
]

async function menu() {
  const { rows } = await db.query<{ name: string; price: number; category: string }>(
    `SELECT p.name, p.price, c.name AS category FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name <> '季節限定'`)
  return rows.map(r => [r.name, r.price, r.category]).sort(byName)
}

describe('練習 4：種子資料', () => {
  it('npx prisma db seed 建立 3 個分類、6 個商品', async () => {
    const r = seed()
    const text = out(r)
    expect(text, 'prisma.config.ts 的 migrations 裡要設定 seed：\'prisma db execute --file prisma/seed.sql\'').not.toMatch(/No seed command configured/i)
    expect(r.status, `npx prisma db seed 失敗：\n${text}`).toBe(0)
    const { rows } = await db.query<{ name: string }>(`SELECT name FROM categories WHERE name <> '季節限定' ORDER BY name`)
    expect(rows.map(r => r.name), '要有 3 個分類：咖啡、茶、甜點').toEqual(['咖啡', '甜點', '茶'].sort())
    expect(await menu(), '6 個商品的名稱、價格、分類要跟題目一樣。測試的資料庫裡已經有一個分類，category_id 要用 (SELECT id FROM categories WHERE name = …) 依名稱找，不要寫死 1、2、3').toEqual([...MENU].sort(byName))
  }, 180_000)

  it('再執行一次不會出錯，也不會多出或刪掉資料', async () => {
    // 同事在開發資料庫加了自己的商品：再跑一次種子資料不能把它刪掉
    await db.query(`INSERT INTO products (name, price, category_id) SELECT '桂花烏龍', 100, id FROM categories WHERE name = '季節限定'`)
    const r = seed()
    expect(r.status, `第二次執行失敗：INSERT 加上 ON CONFLICT (name) DO NOTHING，已經有的就跳過。\n${out(r)}`).toBe(0)
    expect(out(r), `第二次執行失敗：INSERT 加上 ON CONFLICT (name) DO NOTHING。\n${out(r)}`).not.toMatch(/error/i)
    const { rows: [{ k }] } = await db.query<{ k: number }>(`SELECT count(*)::int AS k FROM products WHERE name = '桂花烏龍'`)
    expect(k, '種子資料把別人的資料刪掉了：不要用 TRUNCATE 或 DELETE 讓它可以重跑，改用 ON CONFLICT (name) DO NOTHING').toBe(1)
    expect(await menu(), '執行兩次之後還是同樣 6 個商品').toEqual([...MENU].sort(byName))
    const { rows: [{ c }] } = await db.query<{ c: number }>(`SELECT count(*)::int AS c FROM categories WHERE name <> '季節限定'`)
    expect(c, '執行兩次之後還是 3 個分類').toBe(3)
  }, 180_000)
})
