// 練習 1：test/support/reset-db.ts 的 resetDb(prisma)
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from './src/generated/prisma/client.js'
import { resetDb } from './test/support/reset-db.js'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })

// 模擬「之後才加的資料表」：判分用的資料庫每次都會重建，這張表只存在這個測試檔裡
// 名稱每次執行都不同、而且有大寫（像 Prisma 的 model 沒寫 @@map 時的表名）：寫死表名、沒加雙引號都不會過
const EXTRA = `AuditLog${process.pid}`
beforeAll(() => prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "${EXTRA}" (id SERIAL PRIMARY KEY, message TEXT NOT NULL)`))
afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${EXTRA}"`)
  await prisma.$disconnect()
})

async function fillEveryTable() {
  const category = await prisma.category.create({ data: { name: '飲料' } })
  const product = await prisma.product.create({ data: { name: '拿鐵', price: 110, stock: 5, categoryId: category.id } })
  const customer = await prisma.customer.create({ data: { name: '王小明', phone: '0912000001' } })
  await prisma.order.create({ data: { customerId: customer.id, total: 110, items: { create: [{ productId: product.id, quantity: 1, unitPrice: 110 }] } } })
  await prisma.$executeRawUnsafe(`INSERT INTO "${EXTRA}" (message) VALUES ('建立訂單')`)
}

async function rowCounts() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`
  const counts: Record<string, number> = {}
  for (const { tablename } of tables) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${tablename}"`)
    counts[tablename] = n
  }
  return counts
}

const migrationCount = async () => (await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM _prisma_migrations`)[0].n

describe('練習 1：resetDb', () => {
  it('清空每一張應用程式的資料表，包含之後才新增的表', async () => {
    await fillEveryTable()
    await fillEveryTable().catch(() => undefined)   // 名稱重複會失敗，沒關係：只是讓資料更多
    await resetDb(prisma)
    expect(await rowCounts(), `每張表都要是 0 筆。${EXTRA} 是之後才加的表：表名要從 pg_tables 查，不要寫死`).toEqual({
      [EXTRA]: 0, categories: 0, customers: 0, order_items: 0, orders: 0, products: 0,
    })
  })

  it('自動編號從 1 重新開始', async () => {
    await fillEveryTable()
    await resetDb(prisma)
    const category = await prisma.category.create({ data: { name: '甜點' } })
    expect(category.id, 'resetDb 之後新增的第一筆 id 要是 1：TRUNCATE 要加 RESTART IDENTITY（DELETE／deleteMany 不會重設編號）').toBe(1)
    await prisma.$executeRawUnsafe(`INSERT INTO "${EXTRA}" (message) VALUES ('x')`)
    const [{ id }] = await prisma.$queryRawUnsafe<{ id: number }[]>(`SELECT max(id) AS id FROM "${EXTRA}"`)
    expect(id, `${EXTRA} 的編號也要重設`).toBe(1)
  })

  it('不動 _prisma_migrations', async () => {
    const before = await migrationCount()
    await resetDb(prisma)
    expect(before, '判分資料庫應該已經套用過 migration').toBeGreaterThan(0)
    expect(await migrationCount(), '_prisma_migrations 被清掉了：Prisma 會以為 migration 都沒套用過，下次 migrate deploy 會重跑 CREATE TABLE 而失敗。查表名時排除它').toBe(before)
  })

  it('資料表都是空的時候也能執行', async () => {
    await resetDb(prisma)
    await expect(resetDb(prisma), '連續呼叫兩次不能出錯').resolves.toBeUndefined()
  })
})
