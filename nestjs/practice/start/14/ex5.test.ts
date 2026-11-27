// 練習 5：只改程式裡的名字（@map），資料表不動
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'
import { AppModule } from './src/app.module.js'
import { PrismaClient } from './src/generated/prisma/client.js'

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const raw = { $queryRawUnsafe: async (s: string) => (await db.query(s)).rows as any, $executeRawUnsafe: (s: string) => db.query(s) }

describe('練習 5：分類的 name 改叫 title', () => {
  let app: INestApplication
  beforeAll(async () => { app = await createTestApp(AppModule) })
  afterAll(async () => { await app?.close(); await db.end() })
  beforeEach(() => resetDb(raw))

  it('舊版程式的 SELECT name FROM categories 還能執行（套用你所有的 migration 之後）', async () => {
    await expect(db.query(`INSERT INTO categories (name) VALUES ('咖啡')`), '資料表 categories 要還有 name 欄位：滾動更新時舊版程式還在用它。改名不要動資料表，Prisma 欄位加 @map("name")；如果你產生了改欄位的 migration，刪掉那個 migration 資料夾').resolves.toBeDefined()
    const { rows } = await db.query('SELECT name FROM categories')
    expect(rows).toEqual([{ name: '咖啡' }])
  })

  it('GET /categories 回傳 [{ id, title }]，值就是資料表 name 欄位的內容', async () => {
    await db.query(`INSERT INTO categories (name) VALUES ('咖啡'), ('茶'), ('點心')`)
    const res = await request(app.getHttpServer()).get('/categories')
    expect(res.status).toBe(200)
    expect(res.body, '要剛好是 [{ id, title }]，不能再有 name').toEqual([{ id: 1, title: '咖啡' }, { id: 2, title: '茶' }, { id: 3, title: '點心' }])
  })

  it('Prisma Client 裡的欄位也叫 title（不是只在 controller 改名）', async () => {
    await db.query(`INSERT INTO categories (name) VALUES ('咖啡')`)
    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
    try {
      const rows = await (client.category.findMany as (args: unknown) => Promise<unknown>)({ select: { id: true, title: true } }).catch((e: Error) => e)
      expect(rows, 'prisma.category.findMany({ select: { title: true } }) 要能用：在 schema.prisma 把欄位改成 title String @unique @map("name")，再 npx prisma generate').toEqual([{ id: 1, title: '咖啡' }])
    } finally {
      await client.$disconnect()
    }
  })
})
