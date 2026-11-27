// 練習 1：GET /menu 用 cache-aside，快取放在 Redis，TTL 60 秒
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

// 換掉 PrismaService：數出每個請求送了幾句 SQL
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }), log: [{ emit: 'event', level: 'query' }] })
const sql: string[] = []
prisma.$on('query', e => { sql.push(e.query) })
const redis = new Redis(process.env.REDIS_URL!)
const prefix = process.env.REDIS_PREFIX!
const ourKeys = () => redis.keys(`${prefix}*`)

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
  const keys = await ourKeys()
  if (keys.length) await redis.del(...keys)
  await resetDb(prisma)
  await prisma.$executeRawUnsafe(`INSERT INTO products (name, price, category, active) VALUES
    ('美式咖啡', 80, 'coffee', true), ('拿鐵', 110, 'coffee', true), ('卡布奇諾', 110, 'coffee', true),
    ('伯爵紅茶', 90, 'tea', true), ('可頌', 70, 'food', true), ('起司蛋糕', 120, 'food', true), ('季節限定', 150, 'coffee', false)`)
  sql.length = 0
})

describe('練習 1：GET /menu 的 cache-aside', () => {
  it('第一次查資料庫，第二次直接從快取回傳（0 句 SQL），內容一樣', async () => {
    const first = await request(app.getHttpServer()).get('/menu')
    expect(first.status, `GET /menu 要回 200，實際 ${first.status}：${JSON.stringify(first.body)}`).toBe(200)
    expect(first.body.map((p: { name: string }) => p.name), '菜單是販售中（active）的商品，依 id 排序').toEqual(['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕'])
    expect(sql.length, '第一次（快取裡還沒有）要查資料庫').toBeGreaterThan(0)
    sql.length = 0
    const second = await request(app.getHttpServer()).get('/menu').expect(200)
    expect(second.body, '第二次的內容要跟第一次一樣').toEqual(first.body)
    expect(sql.length, `第二次 GET /menu 還送了 ${sql.length} 句 SQL：快取沒有命中。檢查 get 用的 key 跟 set 的是不是同一個、TTL 是不是寫成秒（cache-manager 的 TTL 單位是毫秒）`).toBe(0)
  })

  it('不同分類用不同的 key：?category=coffee 只有咖啡，也會被快取', async () => {
    await request(app.getHttpServer()).get('/menu').expect(200)
    sql.length = 0
    const coffee = await request(app.getHttpServer()).get('/menu?category=coffee').expect(200)
    expect(coffee.body.map((p: { name: string }) => p.name), '/menu?category=coffee 只回咖啡類：key 要包含分類，不然會拿到全部菜單的快取').toEqual(['美式咖啡', '拿鐵', '卡布奇諾'])
    sql.length = 0
    await request(app.getHttpServer()).get('/menu?category=coffee').expect(200)
    expect(sql.length, '第二次 GET /menu?category=coffee 也要從快取回傳').toBe(0)
  })

  it('分類裡沒有販售中的商品（空陣列）也要被快取', async () => {
    await prisma.$executeRawUnsafe(`UPDATE products SET active = false WHERE category = 'tea'`)
    const first = await request(app.getHttpServer()).get('/menu?category=tea').expect(200)
    expect(first.body, '茶類全部停售時，GET /menu?category=tea 回空陣列').toEqual([])
    sql.length = 0
    await request(app.getHttpServer()).get('/menu?category=tea').expect(200)
    expect(sql.length, '空陣列也是合法的快取值：判斷有沒有命中要用 cached !== undefined，不能用 cached?.length').toBe(0)
  })

  it('快取存在 Redis：key 是 REDIS_PREFIX::menu:v1:all 與 REDIS_PREFIX::menu:v1:category:<分類>，TTL 60 秒', async () => {
    await request(app.getHttpServer()).get('/menu').expect(200)
    await request(app.getHttpServer()).get('/menu?category=coffee').expect(200)
    const keys = await ourKeys()
    for (const key of [`${prefix}::menu:v1:all`, `${prefix}::menu:v1:category:coffee`]) {
      expect(keys, `Redis（${process.env.REDIS_URL}）裡找不到 ${key}（現有：${keys.join('、') || '沒有'}）。CacheModule 還在用預設的記憶體快取？要用 CacheModule.registerAsync，stores 放 createKeyv(REDIS_URL, { namespace: REDIS_PREFIX })，兩個值都從 ConfigService 讀；MenuService 要用 menu:v1:all、menu:v1:category:<分類> 這兩種 key 自己 get／set（CacheInterceptor 存的 key 是網址，不算）`).toContain(key)
      const ttl = await redis.pttl(key)
      expect(ttl, `${key} 沒有設定過期時間（pttl = ${ttl}）：set 的第三個參數是 TTL（毫秒）`).toBeGreaterThan(0)
      expect(ttl, `${key} 的 TTL 是 ${ttl} 毫秒，要在 60 秒（60_000）以內`).toBeLessThanOrEqual(60_000)
      expect(ttl, `${key} 的 TTL 只剩 ${ttl} 毫秒：TTL 單位是毫秒，60 秒要寫 60_000`).toBeGreaterThan(30_000)
    }
  })
})
