// 練習 4：集點卡兌換。Serializable 交易＋有上限的重試
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from './src/generated/prisma/client.js'
import { AppModule } from './src/app.module.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { withRetry } from './src/prisma/retry.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

// 連線池開到 25（預設 10）：比同時送出的 20 個請求多，量到的才是鎖的行為，不是排隊等連線
// 互動式交易的時限放寬到 30 秒（預設 maxWait 2 秒、timeout 5 秒）：判分的電腦可能很忙，量到的要是鎖與死結，不是機器慢
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 25 }),
  transactionOptions: { maxWait: 30_000, timeout: 30_000 },
})
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const slow = db.$extends({ query: { $allModels: { async $allOperations({ args, query }) { const r = await query(args); await sleep(20); return r } } } })

let app: INestApplication
beforeAll(async () => { app = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(slow) }) })
afterAll(async () => { await app?.close(); await db.$disconnect() })
beforeEach(() => resetDb(db))

const known = (code: string) => new Prisma.PrismaClientKnownRequestError(`測試用的 ${code}`, { code, clientVersion: Prisma.prismaVersion.client })

describe('練習 4：withRetry', () => {
  it('前兩次衝突、第三次成功 → 回傳第三次的結果', async () => {
    let calls = 0
    const result = await withRetry(async () => { if (++calls < 3) throw known('P2034'); return 'ok' })
    expect([result, calls], '遇到可重試的錯誤要重新呼叫 run()').toEqual(['ok', 3])
  })

  it('一直衝突：重試 3 次（總共 4 次）後把錯誤丟出去', async () => {
    let calls = 0
    // 第 10 次起改丟別的錯誤，讓沒有上限的迴圈也會停下來
    const err = await withRetry(async () => { calls++; throw calls >= 10 ? new Error('停') : known('P2034') }).catch(e => e)
    expect(calls, '最多重試 3 次：第 1 次＋3 次重試＝4 次。沒有上限的重試會在資料庫出問題時把它壓垮').toBe(4)
    expect((err as { code?: string }).code, '用完次數後丟出最後一次的錯誤').toBe('P2034')
  })

  it('不能重試的錯誤直接丟出去，只執行 1 次', async () => {
    let calls = 0
    const err = await withRetry(async () => { calls++; throw known('P2002') }).catch(e => e)
    expect([calls, (err as { code?: string }).code], 'P2002 這類錯誤重試也一樣，馬上丟出').toEqual([1, 'P2002'])
  })
})

describe('練習 4：POST /stamp-cards/:id/redeem', () => {
  it('餘額 10 點，5 個請求同時各兌換 4 點：剛好 2 個成功、3 個 409，餘額 2，沒有 500', async () => {
    await db.stampCard.create({ data: { customerName: '王小明', transactions: { create: [{ points: 6, reason: '消費' }, { points: 4, reason: '消費' }] } } })
    const res = await Promise.all(Array.from({ length: 5 }, () =>
      request(app.getHttpServer()).post('/stamp-cards/1/redeem').send({ points: 4 })))
    const statuses = res.map(r => r.status)
    expect(statuses.filter(s => s >= 500).length, `不能有 500。Serializable 交易發現衝突時會失敗（P2034），要用 withRetry 重試整個 $transaction。第一個 500：${JSON.stringify(res.find(r => r.status >= 500)?.body)}`).toBe(0)
    const { _sum } = await db.pointTransaction.aggregate({ where: { cardId: 1 }, _sum: { points: true } })
    expect(_sum.points, '餘額要是 2。變成負數代表兩個請求都讀到同一個餘額：查餘額和新增紀錄要在同一個 isolationLevel: \'Serializable\' 的交易裡').toBe(2)
    expect(statuses.filter(s => s === 200).length, '只能有 2 個成功').toBe(2)
    expect(res.filter(r => r.status === 409).map(r => r.body.errorCode), '其他 3 個回 409 INSUFFICIENT_POINTS').toEqual(['INSUFFICIENT_POINTS', 'INSUFFICIENT_POINTS', 'INSUFFICIENT_POINTS'])
  })
})
