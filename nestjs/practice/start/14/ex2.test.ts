// 練習 2：ProductsService 的 CRUD、select、處理 P2002／P2025
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
const LEAK = /Invalid|invocation|constraint|_key|\.ts:\d+/

async function seed() {
  await resetDb(raw)
  await db.query(`INSERT INTO categories (name) VALUES ('咖啡'), ('茶'), ('點心')`)
  await db.query(`INSERT INTO products (name, price, cost_price, is_available, category_id) VALUES
    ('美式咖啡', 80, 22, true, 1), ('拿鐵', 110, 35, true, 1), ('伯爵紅茶', 90, 18, false, 2), ('可頌', 70, 28, true, 3)`)
}

const LIST = [
  { id: 1, name: '美式咖啡', price: 80, isAvailable: true, categoryId: 1 },
  { id: 2, name: '拿鐵', price: 110, isAvailable: true, categoryId: 1 },
  { id: 3, name: '伯爵紅茶', price: 90, isAvailable: false, categoryId: 2 },
  { id: 4, name: '可頌', price: 70, isAvailable: true, categoryId: 3 },
]
const SHAPE = '{ id, name, price, isAvailable, categoryId }：用 select 只拿這幾個欄位，不要回傳整個 Prisma model（costPrice、createdAt、category 都不能出現）'

describe('練習 2：商品 CRUD', () => {
  let app: INestApplication
  beforeAll(async () => { app = await createTestApp(AppModule) })
  afterAll(async () => { await app?.close() })
  beforeEach(seed)
  const http = () => request(app.getHttpServer())

  it('GET /products 只回傳 API 要的欄位，不外洩 costPrice', async () => {
    const res = await http().get('/products')
    expect(res.status).toBe(200)
    expect(res.body, `每個商品要剛好是 ${SHAPE}；依 id 由小到大`).toEqual(LIST)
  })

  it('GET /products?categoryId=1 只回傳那個分類的商品', async () => {
    const res = await http().get('/products?categoryId=1')
    expect(res.body, 'findMany 的 where 要用上 categoryId；沒給 categoryId 時（undefined）Prisma 會忽略這個條件').toEqual(LIST.slice(0, 2))
    const all = await http().get('/products')
    expect(all.body.length, '沒有 categoryId 時要回傳全部商品').toBe(4)
  })

  it('POST /products 建立商品 → 201，回應的形狀一樣', async () => {
    const res = await http().post('/products').send({ name: '卡布奇諾', price: 110, categoryId: 1 })
    expect(res.status).toBe(201)
    expect(res.body, `回應要剛好是 ${SHAPE}`).toEqual({ id: 5, name: '卡布奇諾', price: 110, isAvailable: true, categoryId: 1 })
  })

  it('名稱重複 → 409 PRODUCT_NAME_TAKEN', async () => {
    const res = await http().post('/products').send({ name: '拿鐵', price: 120, categoryId: 1 })
    expect(res.status, '名稱重複時 create 會丟 P2002：在 service 用 try/catch 接住，改丟 ProductNameTakenError').toBe(409)
    expect(res.body.errorCode, "errorCode 要是 'PRODUCT_NAME_TAKEN'（比全域 filter 的 UNIQUE_VIOLATION 更具體，前端能直接顯示「名稱已被使用」）").toBe('PRODUCT_NAME_TAKEN')
    expect(res.text, '回應不能出現 Prisma 的原文').not.toMatch(LEAK)
  })

  it('PATCH /products/:id：更新成功 → 200；不存在 → 404 PRODUCT_NOT_FOUND；改成重複的名稱 → 409', async () => {
    const ok = await http().patch('/products/2').send({ price: 120 })
    expect(ok.status).toBe(200)
    expect(ok.body, `更新的回應要剛好是 ${SHAPE}`).toEqual({ ...LIST[1], price: 120 })

    const missing = await http().patch('/products/999').send({ price: 120 })
    expect(missing.status, '更新不存在的商品，update 會丟 P2025：接住後改丟 ProductNotFoundError').toBe(404)
    expect(missing.body.errorCode).toBe('PRODUCT_NOT_FOUND')

    const dup = await http().patch('/products/2').send({ name: '可頌' })
    expect(dup.status, '改成別的商品已經在用的名稱是 P2002，不是「找不到」：要依 e.code 分開處理，不能把所有 Prisma 錯誤都當成 404').toBe(409)
    expect(dup.body.errorCode).toBe('PRODUCT_NAME_TAKEN')
  })

  it('DELETE /products/:id：成功 → 204；不存在 → 404 PRODUCT_NOT_FOUND', async () => {
    const ok = await http().delete('/products/4')
    expect(ok.status).toBe(204)
    const { rows } = await db.query('SELECT count(*)::int AS n FROM products WHERE id = 4')
    expect(rows[0].n, '刪除後資料表裡不能再有這個商品').toBe(0)
    const missing = await http().delete('/products/4')
    expect(missing.status, '刪除不存在的商品，delete 會丟 P2025：改丟 ProductNotFoundError').toBe(404)
    expect(missing.body.errorCode).toBe('PRODUCT_NOT_FOUND')
  })
})

describe('練習 2：同時建立同名商品', () => {
  let app: INestApplication
  let client: PrismaClient
  beforeAll(async () => {
    // 每次讀取都慢 50ms：讓「先查再寫」的寫法一定會出現兩個請求都查不到、都去 INSERT 的情況
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
    const slow = client.$extends({ query: { $allModels: { async $allOperations({ operation, args, query }) {
      if (/^(find|count|aggregate|groupBy)/.test(operation)) await new Promise(r => setTimeout(r, 50))
      return query(args)
    } } } })
    app = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(slow) })
  })
  afterAll(async () => { await app?.close(); await client?.$disconnect(); await db.end() })
  beforeEach(seed)

  it('5 個請求同時建立「焦糖瑪奇朵」：剛好一個 201、四個 409，沒有 500', async () => {
    const all = await Promise.all(Array.from({ length: 5 }, () =>
      request(app.getHttpServer()).post('/products').send({ name: '焦糖瑪奇朵', price: 130, categoryId: 1 })))
    const statuses = all.map(r => r.status).sort()
    expect(statuses, '先 findFirst 確認沒人用再 create，並發時大家都查不到、都去 INSERT：只能交給 UNIQUE 約束，接住 P2002').toEqual([201, 409, 409, 409, 409])
    for (const r of all.filter(r => r.status === 409)) {
      expect(r.body.errorCode, '每個 409 都要是 PRODUCT_NAME_TAKEN（先查再寫的寫法，撞到 P2002 的那幾個會變成 UNIQUE_VIOLATION 或 500）').toBe('PRODUCT_NAME_TAKEN')
    }
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM products WHERE name = '焦糖瑪奇朵'`)
    expect(rows[0].n).toBe(1)
  })
})
