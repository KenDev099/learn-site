// 練習 1：廚房看板的 N+1。GET /kitchen/board 的查詢數不能隨訂單數增加，回應跟原本一樣
import request from 'supertest'
import pg from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './api/src/app.module.js'
import { PrismaService } from './api/src/common/prisma.service.js'
import { PrismaClient } from './api/src/generated/prisma/client.js'

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
// 會數查詢的 Prisma Client：換掉 app 裡的 PrismaService，每送出一個查詢 queries 加 1
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), log: [{ emit: 'event', level: 'query' }] })
let queries = 0
prisma.$on('query', () => { queries++ })
let app: INestApplication

// 放 n 張廚房進行中的訂單（paid／preparing 交錯，品項 1～3 個），再放幾張不該出現的（pending、picked_up）
async function seedBoard(n: number) {
  await db.query('TRUNCATE orders RESTART IDENTITY CASCADE')
  await db.query(`
    INSERT INTO orders (customer_id, status, total, ordered_at, pickup_at)
    SELECT 1 + g % 6, CASE WHEN g % 3 = 0 THEN 'preparing' ELSE 'paid' END, 100,
           timestamptz '2026-11-09 00:00Z' + interval '1 minute' * ((g * 37) % 101),
           CASE WHEN g % 4 = 0 THEN timestamptz '2026-11-09 02:00Z' END
    FROM generate_series(1, $1) g`, [n])
  await db.query(`INSERT INTO orders (customer_id, status, total, ordered_at) VALUES (1, 'pending', 80, '2026-11-08 23:00Z'), (2, 'picked_up', 80, '2026-11-08 22:00Z')`)
  await db.query(`
    INSERT INTO order_items (order_id, product_id, quantity, unit_price)
    SELECT o.id, 1 + (o.id + k) % 6, 1 + k, 100 FROM orders o CROSS JOIN generate_series(0, 2) k WHERE k < 1 + o.id % 3`)
}

// 標準答案：直接用 SQL 算出看板應該長怎樣（最早下單的在前；同一張單的品項順序不計較）
async function expected() {
  const { rows } = await db.query(`
    SELECT o.id, o.status, o.ordered_at, o.pickup_at,
           json_agg(json_build_object('name', p.name, 'quantity', i.quantity) ORDER BY i.id) AS items
    FROM orders o JOIN order_items i ON i.order_id = o.id JOIN products p ON p.id = i.product_id
    WHERE o.status IN ('paid', 'preparing')
    GROUP BY o.id ORDER BY o.ordered_at, o.id`)
  return rows.map(r => ({ id: r.id, status: r.status, orderedAt: r.ordered_at.toISOString(), pickupAt: r.pickup_at?.toISOString() ?? null, items: r.items }))
}

const sortItems = (board: { items: { name: string, quantity: number }[] }[]) =>
  board.map(o => ({ ...o, items: [...o.items].sort((a, b) => a.name.localeCompare(b.name) || a.quantity - b.quantity) }))

async function board() {
  queries = 0
  const res = await request(app.getHttpServer()).get('/kitchen/board')
  expect(res.status, `GET /kitchen/board 回 ${res.status}：${JSON.stringify(res.body)}`).toBe(200)
  return { body: res.body, queries }
}

beforeAll(async () => {
  await db.connect()
  app = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(prisma) })
})
afterAll(async () => {
  await app?.close()
  await prisma.$disconnect()
  await db.end()
})

describe('練習 1：廚房看板的 N+1', () => {
  it('5 張單和 200 張單的查詢數一樣，而且最多 3 個', async () => {
    await seedBoard(5)
    const small = await board()
    expect(small.body.length, '看板要列出 5 張 paid／preparing 的訂單').toBe(5)
    await seedBoard(200)
    const big = await board()
    expect(big.body.length, '看板要列出 200 張 paid／preparing 的訂單').toBe(200)
    expect(small.queries, '看板一個查詢都沒送：要透過注入的 PrismaService 查資料庫').toBeGreaterThan(0)
    expect(big.queries, `5 張單 ${small.queries} 個查詢、200 張單 ${big.queries} 個：查詢數跟著訂單數增加，還是 N+1。品項和商品名稱要跟訂單一起查（include），不要在迴圈裡查`).toBe(small.queries)
    expect(big.queries, `一次看板送了 ${big.queries} 個查詢：用一個 findMany 加 include（訂單 → 品項 → 商品）就夠了`).toBeLessThanOrEqual(3)
  })

  it('回應跟原本一樣：只有 paid／preparing、最早下單的在前、每張單的品項名稱與數量、時間是 ISO 字串', async () => {
    await seedBoard(30)
    const { body } = await board()
    const want = await expected()
    expect(body.map((o: { id: number }) => o.id), '訂單的順序不對：依 ordered_at 由舊到新，相同時再依 id').toEqual(want.map(o => o.id))
    expect(sortItems(body), '看板每張單的欄位要跟原本一樣：{ id, status, orderedAt, pickupAt, items: [{ name, quantity }] }').toEqual(sortItems(want))
  })
})
