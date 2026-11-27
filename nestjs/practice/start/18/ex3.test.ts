// 練習 3：付款和加點在同一個交易：tx 一路傳給 StampCardsService.addPoints
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './src/generated/prisma/client.js'
import { AppModule } from './src/app.module.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 15 }) })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const slow = db.$extends({ query: { $allModels: { async $allOperations({ args, query }) { const r = await query(args); await sleep(20); return r } } } })
// 記下「交易外」的 stampCard／pointTransaction 查詢：tx 是 $transaction 另外給的物件，不會經過這裡。
// 記在「呼叫方法」的時候，先把 this.prisma.stampCard 存到別的變數再用也躲不掉
let outside: string[] = []
const watched = new Proxy(slow, {
  get(target, prop) {
    const v = Reflect.get(target, prop)
    if (prop !== 'stampCard' && prop !== 'pointTransaction') return v
    return new Proxy(v, {
      get(d, m) {
        const f = Reflect.get(d, m)
        return typeof f === 'function' ? (...args: unknown[]) => { outside.push(`${String(prop)}.${String(m)}`); return f.apply(d, args) } : f
      },
    })
  },
})

let app: INestApplication
beforeAll(async () => { app = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(watched) }) })
afterAll(async () => { await app?.close(); await db.$disconnect() })
beforeEach(async () => {
  await resetDb(db)
  await db.customer.create({ data: { name: '王小明', stampCard: { create: {} } } })   // 顧客 1，有集點卡 1
  await db.customer.create({ data: { name: '陳美華' } })                             // 顧客 2，沒有集點卡
  await db.order.createMany({ data: [{ customerId: 1, total: 190 }, { customerId: 2, total: 80 }] })
  outside = []
})
const pay = (id: number) => request(app.getHttpServer()).post(`/orders/${id}/pay`)

describe('練習 3：付款與加點在同一個交易', () => {
  it('付款成功：訂單 paid，集點卡多一筆 +1 點', async () => {
    const res = await pay(1)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.status).toBe('paid')
    const rows = await db.pointTransaction.findMany({ select: { cardId: true, points: true } })
    expect(rows, '付款時呼叫 stampCards.addPoints(tx, order.customerId, 1)，集點卡 1 多一筆 1 點').toEqual([{ cardId: 1, points: 1 }])
  })

  it('沒有集點卡：回 422 STAMP_CARD_NOT_FOUND，訂單還是 pending', async () => {
    const res = await pay(2)
    expect([res.status, res.body.errorCode], `加點失敗要讓整個付款失敗：${JSON.stringify(res.body)}`).toEqual([422, 'STAMP_CARD_NOT_FOUND'])
    expect((await db.order.findUniqueOrThrow({ where: { id: 2 } })).status, '訂單要回滾成 pending。付款的 updateMany 和 addPoints 要在同一個 this.prisma.$transaction(async tx => …) 裡，加點丟出錯誤，前面的付款才會一起回滾；交易結束後才加點就來不及了').toBe('pending')
  })

  it('addPoints 用的是傳進來的 tx，不是 this.prisma', async () => {
    expect((await pay(1)).status).toBe(200)
    expect(outside, 'addPoints 裡碰到了 this.prisma.stampCard／pointTransaction：那一句走的是另一條連線、另一個交易，付款回滾時點數不會跟著回滾。改成 addPoints(tx: Prisma.TransactionClient, customerId, points)，裡面用 tx').toEqual([])
  })

  it('同一張訂單同時付款 5 次：只加 1 次點', async () => {
    const res = await Promise.all(Array.from({ length: 5 }, () => pay(1)))
    expect(res.filter(r => r.status === 200).length, '只能成功 1 次').toBe(1)
    expect(await db.pointTransaction.count(), '失敗的付款不能留下點數').toBe(1)
  })
})
