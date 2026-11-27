// 練習 2：兩台伺服器同時跑 expireStamps，只有一台真的做事；同一天重跑不會多加
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './src/generated/prisma/client.js'
import { AppModule } from './src/app.module.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { StampCardsService } from './src/stamp-cards/stamp-cards.service.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
// 兩台「伺服器」：各自的 Nest 應用、各自的連線池，接同一個資料庫。每句 model 查詢後停 100 毫秒，讓兩台的工作一定重疊
const server = () => {
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  const slow = client.$extends({ query: { $allModels: { async $allOperations({ args, query }) { const r = await query(args); await sleep(100); return r } } } })
  return { client, slow }
}
const a = server(), b = server()
let appA: INestApplication, appB: INestApplication
let stampsA: StampCardsService, stampsB: StampCardsService
beforeAll(async () => {
  appA = await createTestApp(AppModule, { override: x => x.overrideProvider(PrismaService).useValue(a.slow) })
  appB = await createTestApp(AppModule, { override: x => x.overrideProvider(PrismaService).useValue(b.slow) })
  stampsA = appA.get(StampCardsService)
  stampsB = appB.get(StampCardsService)
})
afterAll(async () => {
  // 錯誤寫法可能讓某條連線一直等鎖：先把它們斷掉，測試才收得了尾
  await db.$executeRawUnsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND wait_event_type = 'Lock'`)
  await appA?.close(); await appB?.close()
  await Promise.all([a.client.$disconnect(), b.client.$disconnect(), db.$disconnect()])
})

const DAY1 = new Date('2030-03-01T19:00:00Z')
const DAY2 = new Date('2030-03-02T19:00:00Z')
const DAY3 = new Date('2030-03-03T19:00:00Z')
// 每位顧客一張卡，各有一筆 createdAt 的紀錄
async function seedCards(list: { points: number, createdAt: string }[]) {
  const start = await db.stampCard.count()
  for (const [i, c] of list.entries()) {
    const customer = await db.customer.create({ data: { name: `顧客 ${start + i + 1}` } })
    const card = await db.stampCard.create({ data: { customerId: customer.id } })
    await db.pointTransaction.create({ data: { cardId: card.id, points: c.points, reason: '消費', createdAt: new Date(c.createdAt) } })
  }
}
const expiredRows = () => db.pointTransaction.findMany({ where: { points: { lt: 0 } }, orderBy: { cardId: 'asc' }, select: { cardId: true, points: true } })
// 卡住超過 8 秒就當成在等一個永遠不會放掉的鎖
const within = <T>(p: Promise<T>, what: string) => Promise.race([p, sleep(8000).then(() => { throw new Error(`${what} 超過 8 秒沒有結束：可能在等一個沒有放掉的 advisory lock（pg_advisory_lock 沒有 unlock）。用 pg_try_advisory_xact_lock，交易結束時自動放掉`) })])

beforeEach(async () => {
  await resetDb(db)
  await seedCards([
    { points: 5, createdAt: '2028-12-01T02:00:00Z' },   // 卡 1：要過期
    { points: 3, createdAt: '2028-11-01T02:00:00Z' },   // 卡 2：要過期
    { points: 2, createdAt: '2029-12-01T02:00:00Z' },   // 卡 3：一年內，不動
  ])
})

describe('練習 2：多台伺服器只執行一次、重跑結果不變', () => {
  it('兩台同時執行：只有一組過期紀錄，一台做事、另一台跳過', async () => {
    const done: string[] = []
    const run = (s: StampCardsService) => s.expireStamps(DAY1).then(r => { done.push(r === 0 ? 'skip' : 'work'); return r })
    const [ra, rb] = await within(Promise.all([run(stampsA), run(stampsB)]), '同時執行')
    const rows = await expiredRows()
    expect(rows, `兩台伺服器各加了一次過期紀錄（${rows.length} 筆）。每台伺服器都有自己的記憶體，boolean 旗標擋不住另一台；在交易裡先 SELECT pg_try_advisory_xact_lock(hashtext('expire-stamps'))，拿不到就 return 0`).toEqual([{ cardId: 1, points: -5 }, { cardId: 2, points: -3 }])
    expect([ra, rb].sort(), '一台回傳 2（做了事），另一台回傳 0（沒拿到鎖，跳過）').toEqual([0, 2])
    expect(done, '沒拿到鎖的那台要立刻回傳 0，不是等另一台做完：pg_advisory_xact_lock 拿不到會一直等，占著一條連線；用 pg_try_advisory_xact_lock').toEqual(['skip', 'work'])
  })

  it('同一天再跑一次：不會再加紀錄', async () => {
    await within(stampsA.expireStamps(DAY1), '第一次執行')
    const again = await within(stampsB.expireStamps(DAY1), '同一天重跑')
    expect(await expiredRows(), '重跑又加了一次：要用目前餘額（所有紀錄加總，包含兌換和之前的過期紀錄）判斷，餘額是 0 就不用處理').toEqual([{ cardId: 1, points: -5 }, { cardId: 2, points: -3 }])
    expect(again, '沒有卡要過期，回傳 0').toBe(0)
  })

  it('鎖用完會放掉：之後每一天，兩台伺服器都還能執行', async () => {
    await within(Promise.all([stampsA.expireStamps(DAY1), stampsB.expireStamps(DAY1)]), '第一天')
    await seedCards([{ points: 4, createdAt: '2029-03-01T00:00:00Z' }])   // 卡 4：第二天過期
    expect(await within(stampsA.expireStamps(DAY2), '第二天（A）'), '第二天 A 執行要處理卡 4：鎖沒放掉的話，另一台永遠拿不到').toBe(1)
    await seedCards([{ points: 7, createdAt: '2029-03-02T00:00:00Z' }])   // 卡 5：第三天過期
    expect(await within(stampsB.expireStamps(DAY3), '第三天（B）'), '第三天 B 執行要處理卡 5：session 層級的 pg_try_advisory_lock 不 unlock，鎖會一直留在那條連線上。改用 pg_try_advisory_xact_lock').toBe(1)
  })
})
