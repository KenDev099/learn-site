// 練習 2：同一張訂單並發付款只能成功一次（條件更新），兩台伺服器也一樣
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './src/generated/prisma/client.js'
import { AppModule } from './src/app.module.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
// 兩台「伺服器」：各自的 Nest 應用、各自的連線池，接同一個資料庫。每句查詢後停 30 毫秒，讓並發的請求一定交錯
const server = () => {
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 10 }) })
  const slow = client.$extends({ query: { $allModels: { async $allOperations({ args, query }) { const r = await query(args); await sleep(30); return r } } } })
  return { client, slow }
}
const a = server(), b = server()
let appA: INestApplication, appB: INestApplication
beforeAll(async () => {
  appA = await createTestApp(AppModule, { override: x => x.overrideProvider(PrismaService).useValue(a.slow) })
  appB = await createTestApp(AppModule, { override: x => x.overrideProvider(PrismaService).useValue(b.slow) })
})
afterAll(async () => {
  await appA?.close(); await appB?.close()
  await Promise.all([a.client.$disconnect(), b.client.$disconnect(), db.$disconnect()])
})
beforeEach(async () => {
  await resetDb(db)
  await db.customer.create({ data: { name: '王小明', stampCard: { create: {} } } })
  await db.order.create({ data: { customerId: 1, total: 190 } })   // id 1，pending
})
const pay = (app: INestApplication) => request(app.getHttpServer()).post('/orders/1/pay')

describe('練習 2：防止重複付款', () => {
  it('兩台伺服器同時收到 5 次付款：只有 1 次 200，其他 409', async () => {
    const res = await Promise.all([pay(appA), pay(appB), pay(appA), pay(appB), pay(appA)])
    const statuses = res.map(r => r.status)
    expect(statuses.filter(s => s >= 500), `不能有 5xx：${JSON.stringify(res.find(r => r.status >= 500)?.body)}`).toEqual([])
    expect(statuses.filter(s => s === 200).length, `只能成功 1 次，現在是 ${statuses.join(',')}。先讀狀態、再用 id 更新，兩個請求都會讀到 pending、都寫成 paid；記憶體裡的鎖只管得到同一台伺服器。改用 updateMany({ where: { id, status: 剛剛讀到的狀態 }, … })，count 是 0 就丟 OrderStateConflictError`).toBe(1)
    expect(statuses.filter(s => s === 409).length, '其他 4 次回 409').toBe(4)
    const codes = res.filter(r => r.status === 409).map(r => r.body.errorCode)
    expect(codes.every(c => c === 'ORDER_STATE_CONFLICT' || c === 'INVALID_TRANSITION'), `409 的 errorCode 要是 ORDER_STATE_CONFLICT（寫入時狀態已經變了）或 INVALID_TRANSITION（讀到時已經是 paid）：${codes}`).toBe(true)
    expect(codes, '同時讀到 pending 的請求，寫入時要因為條件不符而丟 OrderStateConflictError（ORDER_STATE_CONFLICT）').toContain('ORDER_STATE_CONFLICT')
    expect((await db.order.findUniqueOrThrow({ where: { id: 1 } })).status, '訂單最後是 paid').toBe('paid')
  })

  it('取消已付款的訂單 → 200 cancelled（條件要比對剛讀到的狀態，不是寫死 pending）', async () => {
    expect((await pay(appA)).status, '先付款').toBe(200)
    const res = await request(appB.getHttpServer()).post('/orders/1/cancel')
    expect([res.status, res.body.status], `paid 可以取消。updateMany 的 where 要用剛剛讀到的 order.status，寫死 'pending' 會讓取消已付款的訂單變成 409。收到 ${JSON.stringify(res.body)}`).toEqual([200, 'cancelled'])
  })

  it('付款成功後再付一次 → 409 INVALID_TRANSITION（狀態機擋下）', async () => {
    expect((await pay(appA)).status, '第一次付款要成功').toBe(200)
    const again = await pay(appB)
    expect([again.status, again.body.errorCode], JSON.stringify(again.body)).toEqual([409, 'INVALID_TRANSITION'])
  })
})
