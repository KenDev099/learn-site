// 練習 3：改價、停售時讓菜單快取失效
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

// 改商品的 SQL 故意慢 300 毫秒，才能在「改到一半」的時候插進一個讀取
const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
let slowWrites = false
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const prisma = base.$extends({
  query: {
    product: {
      async $allOperations({ operation, args, query }) {
        if (slowWrites && /^(update|upsert)/.test(operation)) await sleep(300)
        return query(args)
      },
    },
  },
})
const redis = new Redis(process.env.REDIS_URL!)
const prefix = process.env.REDIS_PREFIX!

let app: INestApplication
beforeAll(async () => {
  app = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(prisma) })
})
afterAll(async () => {
  await app?.close()
  await base.$disconnect()
  redis.disconnect()
})

beforeEach(async () => {
  slowWrites = false
  const keys = await redis.keys(`${prefix}*`)
  if (keys.length) await redis.del(...keys)
  await resetDb(base)
  await base.$executeRawUnsafe(`INSERT INTO products (name, price, category) VALUES
    ('美式咖啡', 80, 'coffee'), ('拿鐵', 110, 'coffee'), ('伯爵紅茶', 90, 'tea'), ('可頌', 70, 'food')`)
})

const http = () => request(app.getHttpServer())
const priceOf = (menu: { name: string; price: number }[], name: string) => menu.find(p => p.name === name)?.price

describe('練習 3：資料變了，快取要跟著失效', () => {
  it('PATCH 改價之後，GET /menu 和 GET /menu?category=coffee 立刻看到新價格', async () => {
    await http().get('/menu').expect(200)
    await http().get('/menu?category=coffee').expect(200)
    await http().get('/menu?category=tea').expect(200)
    const res = await http().patch('/products/2').send({ price: 120 })
    expect(res.status, `PATCH /products/2 要回 200，實際 ${res.status}：${JSON.stringify(res.body)}`).toBe(200)
    expect(priceOf((await http().get('/menu')).body, '拿鐵'), 'GET /menu 還是舊價格 110：改價之後要刪掉 menu 的快取（只靠 TTL，使用者會看到舊價格最多 60 秒）').toBe(120)
    expect(priceOf((await http().get('/menu?category=coffee')).body, '拿鐵'), 'GET /menu?category=coffee 還是舊價格：分類的 key 也要刪，不能只刪全部菜單那一個').toBe(120)
  })

  it('PATCH 停售之後，商品從菜單和它的分類裡消失', async () => {
    await http().get('/menu').expect(200)
    await http().get('/menu?category=tea').expect(200)
    await http().patch('/products/3').send({ active: false }).expect(200)
    expect((await http().get('/menu')).body.map((p: { name: string }) => p.name), '停售的伯爵紅茶還在 GET /menu 裡').not.toContain('伯爵紅茶')
    expect((await http().get('/menu?category=tea')).body, '停售的伯爵紅茶還在 GET /menu?category=tea 裡：要刪的是「這個商品所屬分類」的 key').toEqual([])
  })

  it('改價的同時有人讀菜單：結束之後快取不能留著舊價格（先寫資料庫，再刪快取）', async () => {
    await http().get('/menu').expect(200)
    slowWrites = true
    const patch = http().patch('/products/1').send({ price: 85 }).then(r => r)   // 寫入要 300 毫秒
    await sleep(100)
    await http().get('/menu').expect(200)                                         // 寫到一半時有人讀菜單
    const res = await patch
    expect(res.status, `PATCH /products/1 要回 200，實際 ${res.status}`).toBe(200)
    slowWrites = false
    expect(priceOf((await http().get('/menu')).body, '美式咖啡'), '改價完成之後，GET /menu 還是舊價格 80：先刪快取再寫資料庫時，中間的讀取會從資料庫讀到舊價格、再寫回快取。順序要反過來：先寫資料庫，成功後再刪快取').toBe(85)
  })

  it('PATCH 不存在的商品回 404', async () => {
    await http().patch('/products/999').send({ price: 100 }).expect(404)
  })
})
