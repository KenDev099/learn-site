// 練習 1：expireStamps(now) 讓一年沒動的點數歸零，@Cron 每天台北時間 03:00 呼叫
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { AppModule } from './src/app.module.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { StampCardsService } from './src/stamp-cards/stamp-cards.service.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

// 模擬雲端主機：系統時區是 UTC。cron 沒寫 timeZone 時會用系統時區
process.env.TZ = 'UTC'

let app: INestApplication
let prisma: PrismaService
let stamps: StampCardsService
beforeAll(async () => {
  app = await createTestApp(AppModule)
  prisma = app.get(PrismaService)
  stamps = app.get(StampCardsService)
})
afterAll(() => app?.close())

// 故意用 2030 年：程式裡如果偷用 new Date()，算出來的「一年前」會完全不一樣
const NOW = new Date('2030-03-01T19:00:00Z')   // 台北 2030-03-02 03:00
const at = (iso: string) => new Date(iso)
beforeEach(async () => {
  await resetDb(prisma)
  await prisma.customer.createMany({ data: [{ name: '王小明' }, { name: '陳美華' }, { name: '林志豪' }, { name: '張雅婷' }] })
  await prisma.stampCard.createMany({ data: [{ customerId: 1 }, { customerId: 2 }, { customerId: 3 }, { customerId: 4 }] })
  await prisma.pointTransaction.createMany({ data: [
    // 卡 1：最後一筆在 2028-12，超過一年 → 餘額 5 要歸零
    { cardId: 1, points: 3, reason: '消費', createdAt: at('2028-06-01T02:00:00Z') },
    { cardId: 1, points: 2, reason: '消費', createdAt: at('2028-12-01T02:00:00Z') },
    // 卡 2：很久以前開始集點，但 2029-08 還有消費 → 不能過期
    { cardId: 2, points: 4, reason: '消費', createdAt: at('2027-01-01T02:00:00Z') },
    { cardId: 2, points: 1, reason: '消費', createdAt: at('2029-08-01T02:00:00Z') },
    // 卡 3：超過一年，但已經兌換完，餘額 0 → 不用加紀錄
    { cardId: 3, points: 6, reason: '消費', createdAt: at('2028-01-01T02:00:00Z') },
    { cardId: 3, points: -6, reason: '兌換', createdAt: at('2028-02-01T02:00:00Z') },
    // 卡 4：超過一年，兌換過一部分，餘額 4 → 加 -4
    { cardId: 4, points: 10, reason: '消費', createdAt: at('2028-03-01T02:00:00Z') },
    { cardId: 4, points: -6, reason: '兌換', createdAt: at('2028-04-01T02:00:00Z') },
  ] })
})
const balances = async () => {
  const rows = await prisma.pointTransaction.groupBy({ by: ['cardId'], _sum: { points: true }, orderBy: { cardId: 'asc' } })
  return Object.fromEntries(rows.map(r => [r.cardId, r._sum.points]))
}

describe('練習 1：點數過期', () => {
  it('一年沒有紀錄、餘額大於 0 的卡歸零；其他卡不動', async () => {
    const n = await stamps.expireStamps(NOW)
    expect(await balances(), '卡 1、卡 4 的最後一筆紀錄早於 now 的一年前，要歸零；卡 2 一年內有消費要保留。用傳進來的 now 算「一年前」，不要用 new Date()').toEqual({ 1: 0, 2: 5, 3: 0, 4: 0 })
    expect(n, '回傳這次讓幾張卡過期（卡 1、卡 4）').toBe(2)
  })

  it('加一筆負數紀錄，不刪除舊紀錄', async () => {
    await stamps.expireStamps(NOW)
    expect(await prisma.pointTransaction.count({ where: { points: { gt: 0 } } }), '原本的加點紀錄要留著：刪掉就沒有歷史可查（客人來問點數去哪了，答不出來）').toBe(6)
    const added = await prisma.pointTransaction.findMany({ where: { reason: '點數過期' }, orderBy: { cardId: 'asc' }, select: { cardId: true, points: true, createdAt: true } })
    expect(added.map(r => [r.cardId, r.points]), "新增的紀錄：reason 是 '點數過期'，points 是負的餘額").toEqual([[1, -5], [4, -4]])
    expect(added.every(r => r.createdAt.getTime() === NOW.getTime()), '過期紀錄的 createdAt 要等於傳進來的 now').toBe(true)
  })

  it('沒有卡要過期時回傳 0', async () => {
    expect(await stamps.expireStamps(at('2028-12-15T00:00:00Z')), '2028-12-15 時每張卡都還在一年內').toBe(0)
    expect(await prisma.pointTransaction.count({ where: { reason: '點數過期' } })).toBe(0)
  })

  it("排程 expire-stamps：每天台北時間 03:00，呼叫 expireStamps", async () => {
    let job: any
    try {
      job = app.get(SchedulerRegistry).getCronJob('expire-stamps')
    } catch {
      expect.fail("找不到名為 expire-stamps 的 cron 工作：AppModule 要 import ScheduleModule.forRoot()，方法上加 @Cron('0 0 3 * * *', { name: 'expire-stamps', timeZone: 'Asia/Taipei' })")
    }
    expect(job.cronTime.timeZone, "沒指定 timeZone 時用的是伺服器的時區：伺服器多半是 UTC，03:00 會變成台北 11:00。加上 timeZone: 'Asia/Taipei'").toBe('Asia/Taipei')
    const next = job.cronTime.getNextDateFrom(new Date('2030-03-01T00:00:00Z'), job.cronTime.timeZone).toJSDate().toISOString()
    expect(next, '下一次執行要是台北時間 03:00（UTC 前一天 19:00）：秒 分 時 日 月 星期 = 0 0 3 * * *').toBe('2030-03-01T19:00:00.000Z')
    const spy = vi.spyOn(stamps, 'expireStamps').mockResolvedValue(0)
    await job.fireOnTick()
    await vi.waitFor(() => expect(spy, 'cron 方法要呼叫 this.expireStamps(new Date())').toHaveBeenCalledTimes(1))
    expect(spy.mock.calls[0][0], '傳給 expireStamps 的是現在時間（Date）').toBeInstanceOf(Date)
    spy.mockRestore()
  })
})
