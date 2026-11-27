// 練習 2：個人資料不能被快取給別人
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { Redis } from 'ioredis'
import { PrismaPg } from '@prisma/adapter-pg'
import type { INestApplication } from '@nestjs/common'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

const { AppModule } = await import('./src/app.module.js')
const { PrismaService } = await import('./src/prisma/prisma.service.js')
const { PrismaClient } = await import('./src/generated/prisma/client.js')

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }), log: [{ emit: 'event', level: 'query' }] })
const sql: string[] = []
prisma.$on('query', e => { sql.push(e.query) })
const redis = new Redis(process.env.REDIS_URL!)
const prefix = process.env.REDIS_PREFIX!

let app: INestApplication
beforeAll(async () => {
  app = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(prisma) })
})
afterAll(async () => {
  await app?.close()
  await prisma.$disconnect()
  redis.disconnect()
})

beforeEach(async () => {
  const keys = await redis.keys(`${prefix}*`)
  if (keys.length) await redis.del(...keys)
  await resetDb(prisma)
  await prisma.$executeRawUnsafe(`INSERT INTO products (name, price, category) VALUES ('美式咖啡', 80, 'coffee'), ('伯爵紅茶', 90, 'tea')`)
  await prisma.$executeRawUnsafe(`INSERT INTO customers (name, phone) VALUES ('王小明', '0912000001'), ('陳美華', '0912000002')`)
  await prisma.$executeRawUnsafe(`INSERT INTO orders (customer_id, total, ordered_at) VALUES
    (1, 80, '2026-10-01 08:00+08'), (1, 190, '2026-10-02 08:00+08'), (2, 90, '2026-10-03 08:00+08')`)
  sql.length = 0
})

const me = (customerId: number) => request(app.getHttpServer()).get('/customers/me/orders').set('X-Customer-Id', String(customerId))

describe('練習 2：GET /customers/me/orders 不能快取給別人', () => {
  it('王小明先查、陳美華再查：各自只看到自己的訂單', async () => {
    const a = await me(1)
    expect(a.status, `GET /customers/me/orders 要回 200，實際 ${a.status}`).toBe(200)
    expect(a.body.map((o: { id: number }) => o.id), '王小明（X-Customer-Id: 1）的訂單是 2、1').toEqual([2, 1])
    const b = await me(2)
    expect(b.body.map((o: { id: number }) => o.id), '陳美華（X-Customer-Id: 2）拿到了王小明的訂單！CacheInterceptor 用網址當 key，兩個人的網址一樣。這種依身分而不同的資料不要快取：拿掉全域的 APP_INTERCEPTOR').toEqual([3])
  })

  it('王小明之後下了新訂單，再查一次要看得到（個人資料不快取）', async () => {
    await me(1).expect(200)
    await prisma.$executeRawUnsafe(`INSERT INTO orders (customer_id, total, ordered_at) VALUES (1, 70, '2026-10-04 08:00+08')`)
    const again = await me(1).expect(200)
    expect(again.body.map((o: { id: number }) => o.id), '剛下的訂單 4 沒有出現：/customers/me/orders 還被快取著').toEqual([4, 2, 1])
  })

  it('GET /menu 仍然有快取（第二次 0 句 SQL）', async () => {
    await request(app.getHttpServer()).get('/menu').expect(200)
    sql.length = 0
    await request(app.getHttpServer()).get('/menu').expect(200)
    expect(sql.length, '拿掉 CacheInterceptor 之後，GET /menu 還是要從快取回傳：練習 1 的 cache-aside 寫在 MenuService 裡').toBe(0)
  })
})
