// 練習 4：GET /orders/:id 回傳固定形狀
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'
import { AppModule } from './src/app.module.js'
import { PrismaClient } from './src/generated/prisma/client.js'
import { PrismaService } from './src/prisma/prisma.service.js'

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const raw = { $queryRawUnsafe: async (s: string) => (await db.query(s)).rows as any, $executeRawUnsafe: (s: string) => db.query(s) }

describe('練習 4：GET /orders/:id', () => {
  let app: INestApplication
  let client: PrismaClient
  const queries: string[] = []
  beforeAll(async () => {
    // 用會記錄每一句 SQL 的 Prisma Client 取代 PrismaService，數一個請求送了幾句 SQL
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }), log: [{ emit: 'event', level: 'query' }] })
    client.$on('query', e => { queries.push(e.query) })
    app = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(client) })
  })
  afterAll(async () => { await app?.close(); await client?.$disconnect(); await db.end() })
  beforeEach(async () => {
    await resetDb(raw)
    await db.query(`INSERT INTO categories (name) VALUES ('咖啡'), ('點心')`)
    await db.query(`INSERT INTO products (name, price, cost_price, category_id) VALUES
      ('美式咖啡', 80, 22, 1), ('拿鐵', 110, 35, 1), ('卡布奇諾', 110, 34, 1), ('可頌', 70, 28, 2), ('起司蛋糕', 120, 45, 2)`)
    await db.query(`INSERT INTO customers (name, phone) VALUES ('王小明', '0912000001'), ('陳美華', '0912000002')`)
    // 訂單 1：上個月下的單，當時拿鐵 100、可頌 65（現在已經漲價）
    await db.query(`INSERT INTO orders (customer_id, status, total, ordered_at) VALUES
      (2, 'paid', 265, '2026-10-01T10:30:00+08:00'), (1, 'pending', 80, '2026-10-02T09:00:00+08:00')`)
    await db.query(`INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
      (1, 2, 2, 100), (1, 4, 1, 65), (2, 1, 1, 80)`)
  })
  const get = (id: number) => request(app.getHttpServer()).get(`/orders/${id}`)

  it('回傳剛好這個形狀，金額用下單當時存下來的', async () => {
    const res = await get(1)
    expect(res.status).toBe(200)
    expect(res.body, '要剛好是 { id, status, orderedAt, customer: { id, name }, items: [{ productId, name, qty, unitPrice }], total }：不能多出 customerId、phone、quantity、product 這些資料表的欄位；金額用明細存的 unitPrice 與訂單的 total，不是商品現在的價格').toEqual({
      id: 1,
      status: 'paid',
      orderedAt: '2026-10-01T02:30:00.000Z',
      customer: { id: 2, name: '陳美華' },
      items: [
        { productId: 2, name: '拿鐵', qty: 2, unitPrice: 100 },
        { productId: 4, name: '可頌', qty: 1, unitPrice: 65 },
      ],
      total: 265,
    })
  })

  it('不存在的訂單 → 404 ORDER_NOT_FOUND', async () => {
    const res = await get(999)
    expect(res.status).toBe(404)
    expect(res.body.errorCode).toBe('ORDER_NOT_FOUND')
  })

  it('SQL 的句數不隨明細數量增加（沒有 N+1）', async () => {
    await db.query(`INSERT INTO orders (customer_id, total) VALUES (1, 490)`)
    await db.query(`INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
      (3, 1, 1, 80), (3, 2, 1, 110), (3, 3, 1, 110), (3, 4, 1, 70), (3, 5, 1, 120)`)
    queries.length = 0
    expect((await get(2)).status).toBe(200)
    const one = queries.length
    queries.length = 0
    const res = await get(3)
    expect(res.status).toBe(200)
    expect(res.body.items.map((i: { name: string }) => i.name), '明細依 id 排序，名稱來自商品').toEqual(['美式咖啡', '拿鐵', '卡布奇諾', '可頌', '起司蛋糕'])
    expect(queries.length, `1 項明細送了 ${one} 句 SQL，5 項送了 ${queries.length} 句：不要在迴圈裡逐項查商品，用一次 findUnique 的 select 把 customer、items、items.product 一起拿`).toBe(one)
    expect(queries.length, `一個請求送了 ${queries.length} 句 SQL：一次 findUnique 加巢狀 select 只需要 4 句（訂單、顧客、明細、商品各一句）`).toBeLessThanOrEqual(4)
  })
})
