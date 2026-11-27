// 練習 3：PrismaModule／PrismaService，GET /products 從資料庫讀
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import request from 'supertest'
import pg from 'pg'
import type { INestApplication } from '@nestjs/common'
import { createTestApp } from '../../helpers/app.ts'

const { AppModule } = await import('./src/app.module.js')
const { PrismaService } = await import('./src/prisma/prisma.service.js')

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
let app: INestApplication
beforeAll(async () => {
  await db.connect()
  app = await createTestApp(AppModule)
})
afterAll(async () => {
  await app?.close()
  await db.end()
})

beforeEach(async () => {
  await db.query('TRUNCATE products, categories RESTART IDENTITY CASCADE')
  await db.query(`INSERT INTO categories (name) VALUES ('茶'), ('咖啡')`)
  await db.query(`INSERT INTO products (name, price, category_id, is_available) VALUES
    ('伯爵紅茶', 90, 1, true), ('拿鐵', 110, 2, false), ('美式咖啡', 80, 2, true)`)
  // 更新過的列在 PostgreSQL 裡會換位置：沒有 ORDER BY 的查詢，伯爵紅茶就會跑到最後
  await db.query(`UPDATE products SET price = 95 WHERE id = 1`)
})

describe('練習 3：PrismaService 與 GET /products', () => {
  it('prisma.service.ts 不直接讀 process.env', () => {
    const code = readFileSync(join(import.meta.dirname, 'src/prisma/prisma.service.ts'), 'utf8')
    expect(code, 'DATABASE_URL 從 ConfigService 拿（第 11 課：驗證過的設定），不要讀 process.env 或寫死連線網址').not.toMatch(/process\s*\.\s*env|postgres(ql)?:\/\//)
  })

  it('PrismaService 是 Prisma Client', () => {
    const prisma = app.get(PrismaService, { strict: false }) as unknown as Record<string, { findMany?: unknown }>
    expect(typeof prisma.product?.findMany, 'PrismaService 要 extends PrismaClient（從 ../generated/prisma/client.js import），才有 this.product.findMany').toBe('function')
  })

  it('GET /products 回傳資料庫裡的商品，含分類，依 id 排序', async () => {
    const res = await request(app.getHttpServer()).get('/products')
    expect(res.status, `GET /products 要回 200，實際 ${res.status}：${JSON.stringify(res.body)}`).toBe(200)
    expect(res.body, '回傳的是判分資料庫裡的 3 筆商品：連線網址要從 ConfigService 拿（測試會換成判分用的 DATABASE_URL）；查詢要 include: { category: true }、orderBy: { id: \'asc\' }').toMatchObject([
      { id: 1, name: '伯爵紅茶', price: 95, isAvailable: true, categoryId: 1, category: { id: 1, name: '茶' } },
      { id: 2, name: '拿鐵', price: 110, isAvailable: false, categoryId: 2, category: { id: 2, name: '咖啡' } },
      { id: 3, name: '美式咖啡', price: 80, isAvailable: true, categoryId: 2, category: { id: 2, name: '咖啡' } },
    ])
    expect(res.body.length, '只回傳資料庫裡的 3 筆').toBe(3)
  })

  it('ProductsService 用注入的 PrismaService 查詢', async () => {
    const findMany = vi.fn(async () => [{ id: 99, name: '測試替身', price: 1 }])
    const fake = { product: { findMany }, $disconnect: vi.fn(async () => {}) }
    const own = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(fake) })
    try {
      const res = await request(own.getHttpServer()).get('/products')
      expect(res.body, 'GET /products 要回傳 this.prisma.product.findMany(...) 的結果：用建構子注入的 PrismaService，不要自己 new PrismaClient()').toEqual([{ id: 99, name: '測試替身', price: 1 }])
      expect(findMany, 'findMany 要帶 include: { category: true } 與 orderBy: { id: \'asc\' }').toHaveBeenCalledWith(
        expect.objectContaining({ include: { category: true }, orderBy: { id: 'asc' } }))
    } finally {
      await own.close()
    }
  })

  it('30 個同時的請求共用同一個連線池', async () => {
    const server = app.getHttpServer()
    const results = await Promise.all(Array.from({ length: 30 }, () => request(server).get('/products')))
    expect(results.every(r => r.status === 200), '30 個請求都要成功').toBe(true)
    const { rows: [{ n }] } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()`)
    expect(n, `資料庫上有 ${n} 條連線，超過連線池的上限 10：不要每個請求 new PrismaClient()，注入同一個 PrismaService`).toBeLessThanOrEqual(10)
  })

  it('應用程式關閉時（onApplicationShutdown）才 $disconnect', async () => {
    const own = await createTestApp(AppModule)
    const prisma = own.get(PrismaService, { strict: false }) as unknown as Record<string, () => Promise<void>>
    const spy = vi.spyOn(prisma, '$disconnect')
    await prisma.onModuleDestroy?.()
    await prisma.beforeApplicationShutdown?.()
    expect(spy, '不要在 onModuleDestroy 或 beforeApplicationShutdown 關連線：那時 HTTP 伺服器還沒關，還有請求在用資料庫，改用 onApplicationShutdown').not.toHaveBeenCalled()
    await own.close()
    expect(spy, 'app.close() 時要呼叫 this.$disconnect()：PrismaService 實作 onApplicationShutdown').toHaveBeenCalled()
  })
})
