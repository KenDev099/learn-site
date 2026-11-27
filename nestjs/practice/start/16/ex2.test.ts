// 練習 2：GET /customers/:id/orders 的 cursor 分頁
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { PrismaPg } from '@prisma/adapter-pg'
import type { INestApplication } from '@nestjs/common'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

const { AppModule } = await import('./src/app.module.js')
const { PrismaService } = await import('./src/prisma/prisma.service.js')
const { PrismaClient } = await import('./src/generated/prisma/client.js')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
let app: INestApplication
beforeAll(async () => {
  app = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(prisma) })
})
afterAll(async () => {
  await app?.close()
  await prisma.$disconnect()
})

type Row = { id: number; total: number; orderedAt: string }
type Page = { items: Row[]; nextCursor: string | null }

let expected: number[] = []
beforeEach(async () => {
  await resetDb(prisma)
  await prisma.$executeRawUnsafe(`INSERT INTO customers (name, phone) VALUES ('王小明', '0912000001'), ('陳美華', '0912000002')`)
  // 王小明 25 張訂單只有 5 個不同的時間（每個時間 5 張，id 交錯）；陳美華的訂單穿插其中
  await prisma.$executeRawUnsafe(`INSERT INTO orders (customer_id, total, ordered_at)
    SELECT CASE WHEN i % 4 = 0 THEN 2 ELSE 1 END, 100 + i, timestamptz '2026-10-01 09:00:00+08' + ((i * 7) % 5) * interval '1 hour'
    FROM generate_series(1, 33) AS i`)
  const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(`SELECT id FROM orders WHERE customer_id = 1 ORDER BY ordered_at DESC, id DESC`)
  expected = rows.map(r => r.id)
})

const get = (path: string) => request(app.getHttpServer()).get(path)
const addNewer = (n: number) => prisma.$executeRawUnsafe(`INSERT INTO orders (customer_id, total, ordered_at) SELECT 1, 999, timestamptz '2026-10-02 12:00:00+08' FROM generate_series(1, ${n})`)

async function pageThrough(limit: number, between: () => Promise<unknown> = async () => {}) {
  const seen: Row[] = [], pages: Page[] = []
  let cursor: string | null = null
  for (let i = 0; i < 10; i++) {
    const res = await get(`/customers/1/orders?limit=${limit}${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`)
    expect(res.status, `第 ${i + 1} 頁要回 200，實際 ${res.status}：${JSON.stringify(res.body)}`).toBe(200)
    const page = res.body as Page
    expect(Object.keys(page).sort(), '回傳 { items, nextCursor }').toEqual(['items', 'nextCursor'])
    pages.push(page)
    seen.push(...page.items)
    cursor = page.nextCursor
    if (cursor === null) break
    expect(typeof cursor, 'nextCursor 是字串（最後一頁是 null）').toBe('string')
    await between()
  }
  return { seen, pages }
}

describe('練習 2：cursor 分頁', () => {
  it('依 orderedAt、id 由新到舊，每筆 { id, total, orderedAt }', async () => {
    const res = await get('/customers/1/orders?limit=10')
    expect(res.status, `GET /customers/1/orders?limit=10 要回 200，實際 ${res.status}：${JSON.stringify(res.body)}`).toBe(200)
    expect(Object.keys(res.body.items?.[0] ?? {}).sort(), '每筆只有 id、total、orderedAt').toEqual(['id', 'orderedAt', 'total'])
    expect(res.body.items.map((o: Row) => o.id), '第一頁：ORDER BY ordered_at DESC, id DESC 的前 10 筆（時間相同時，id 大的在前）').toEqual(expected.slice(0, 10))
  })

  it('翻頁中間有新訂單進來，也不會重複或漏掉', async () => {
    const { seen, pages } = await pageThrough(10, () => addNewer(3))
    expect(seen.map(o => o.id), '三頁合起來要剛好是原本的 25 張、每張一次、順序正確。offset 分頁遇到新訂單會整頁往後推（重複）；只用時間當 cursor，時間相同的訂單會被跳過或重複：cursor 要帶 orderedAt 和 id 兩個值').toEqual(expected)
    expect(pages.length, '25 張、每頁 10 張：剛好 3 頁，第 3 頁的 nextCursor 是 null').toBe(3)
  })

  it('筆數剛好是 limit 的倍數時，最後一頁的 nextCursor 就是 null', async () => {
    const { seen, pages } = await pageThrough(5)
    expect(seen.map(o => o.id), '用 limit=5 翻完要剛好是 25 張').toEqual(expected)
    expect(pages.length, '25 張、每頁 5 張：第 5 頁就要回 nextCursor: null，不能讓前端多打一次拿到空頁（多查一筆：take: limit + 1，就知道後面還有沒有）').toBe(5)
  })

  it('壞掉的 cursor 回 400，不是 500', async () => {
    // 後兩個是「解得開、內容卻不對」的 cursor：時間不是時間、少了值。只包 try/catch 不檢查內容，送進查詢就變成 500
    const forged = [JSON.stringify(['不是時間', 1]), JSON.stringify([])].map(s => Buffer.from(s).toString('base64url'))
    for (const bad of ['abc', '!!!', '{"id":1}', ...forged]) {
      const res = await get(`/customers/1/orders?cursor=${encodeURIComponent(bad)}`)
      expect(res.status, `cursor=${bad} 要回 400（BadRequestException），實際 ${res.status}：解不開或內容不對的 cursor 是客戶端的錯：解碼後要檢查時間是有效的日期、id 是整數`).toBe(400)
    }
  })

  it('limit 預設 20、最多 50', async () => {
    const res = await get('/customers/1/orders')
    expect(res.body.items?.length, '沒給 limit 時一頁 20 筆').toBe(20)
    expect((await get('/customers/1/orders?limit=51')).status, 'limit=51 要回 400').toBe(400)
    expect((await get('/customers/1/orders?limit=0')).status, 'limit=0 要回 400').toBe(400)
  })
})
