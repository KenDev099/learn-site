// 練習 1：GET /orders 的 N+1
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { PrismaPg } from '@prisma/adapter-pg'
import type { INestApplication } from '@nestjs/common'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

const { AppModule } = await import('./src/app.module.js')
const { PrismaService } = await import('./src/prisma/prisma.service.js')
const { PrismaClient } = await import('./src/generated/prisma/client.js')

// 換掉 PrismaService：用一個會發出 query 事件的 client，數出每個請求送了幾句 SQL
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }), log: [{ emit: 'event', level: 'query' }] })
const sql: string[] = []
prisma.$on('query', e => { sql.push(e.query) })

let app: INestApplication
beforeAll(async () => {
  app = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(prisma) })
})
afterAll(async () => {
  await app?.close()
  await prisma.$disconnect()
})

beforeEach(async () => {
  await resetDb(prisma)
  await prisma.$executeRawUnsafe(`INSERT INTO products (name, price) VALUES
    ('美式咖啡', 80), ('拿鐵', 110), ('卡布奇諾', 110), ('伯爵紅茶', 90), ('可頌', 70), ('起司蛋糕', 120)`)
  await prisma.$executeRawUnsafe(`INSERT INTO customers (name, phone) VALUES ('王小明', '0912000001'), ('陳美華', '0912000002')`)
  // 60 張訂單：GET /orders 只要最新 50 張。每張兩項明細
  await prisma.$executeRawUnsafe(`INSERT INTO orders (customer_id, total, ordered_at)
    SELECT (i % 2) + 1, 0, timestamptz '2026-10-01 08:00:00+08' + i * interval '10 minutes' FROM generate_series(1, 60) AS i`)
  await prisma.$executeRawUnsafe(`INSERT INTO order_items (order_id, product_id, quantity, unit_price)
    SELECT id, (id % 6) + 1, 2, 100 FROM orders ORDER BY id`)
  await prisma.$executeRawUnsafe(`INSERT INTO order_items (order_id, product_id, quantity, unit_price)
    SELECT id, ((id + 2) % 6) + 1, 1, 70 FROM orders ORDER BY id`)
  await prisma.$executeRawUnsafe(`UPDATE orders SET total = 270`)
  sql.length = 0
})

const names = ['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕']

describe('練習 1：GET /orders 不要 N+1', () => {
  it('回傳最新 50 張訂單，含明細與商品名稱', async () => {
    const res = await request(app.getHttpServer()).get('/orders')
    expect(res.status, `GET /orders 要回 200，實際 ${res.status}：${JSON.stringify(res.body)}`).toBe(200)
    expect(res.body.length, '只要最新 50 張訂單').toBe(50)
    const first = res.body[0]
    expect(Object.keys(first).sort(), '每張訂單的欄位是 id、customerId、total、orderedAt、items（形狀不要變）').toEqual(['customerId', 'id', 'items', 'orderedAt', 'total'])
    expect(res.body.map((o: { id: number }) => o.id), '依 id 由新到舊：60, 59, …, 11').toEqual(Array.from({ length: 50 }, (_, i) => 60 - i))
    for (const o of res.body) {
      expect(o.items, `訂單 ${o.id} 的明細：依明細 id 排序，每項是 { productId, productName, quantity, unitPrice }`).toEqual([
        { productId: (o.id % 6) + 1, productName: names[o.id % 6], quantity: 2, unitPrice: 100 },
        { productId: ((o.id + 2) % 6) + 1, productName: names[(o.id + 2) % 6], quantity: 1, unitPrice: 70 },
      ])
    }
    expect(first.orderedAt, 'orderedAt 是 ISO 時間字串（Date 經過 JSON 會變成字串）').toBe(new Date(Date.parse('2026-10-01T08:00:00+08:00') + 600 * 60_000).toISOString())
  })

  it('一個請求最多 3 句 SQL（訂單、明細、商品各一句）', async () => {
    await request(app.getHttpServer()).get('/orders').expect(200)
    expect(sql.length, `GET /orders 送了 ${sql.length} 句 SQL。迴圈裡的查詢、Promise.all 都還是一筆一句；用 select／include 把明細和商品一起帶回來，Prisma 會用 IN (...) 一次查完。前幾句：\n${sql.slice(0, 4).join('\n')}`).toBeLessThanOrEqual(3)
  })

  it('明細只查這 50 張訂單的，不是整張表撈回來再過濾', async () => {
    await request(app.getHttpServer()).get('/orders').expect(200)
    const items = sql.filter(q => /"order_items"/.test(q))
    expect(items.length, '要查 order_items').toBeGreaterThan(0)
    for (const q of items) expect(q, '查 order_items 的 SQL 要用 order_id 篩選（WHERE order_id IN (...)）：把整張明細表撈回來在 JavaScript 過濾，資料一多就慢、還吃記憶體').toMatch(/\bWHERE\b[\s\S]*"order_id"\s*(IN|=)/)
  })
})
