// 練習 5：StatsListener 更新當日統計；listener 出錯不影響付款，但要留下 error log
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger, type INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AppModule } from './src/app.module.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { taipeiDay } from './src/stats/taipei-day.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

let app: INestApplication
let prisma: PrismaService
beforeAll(async () => {
  app = await createTestApp(AppModule)
  prisma = app.get(PrismaService)
})
afterAll(() => app?.close())
beforeEach(async () => {
  await resetDb(prisma)
  await prisma.customer.createMany({ data: [{ name: '王小明' }, { name: '林志豪' }] })
  await prisma.stampCard.createMany({ data: [{ customerId: 1 }, { customerId: 2 }] })
  await prisma.order.createMany({ data: [{ customerId: 1, total: 190 }, { customerId: 2, total: 110 }] })
})
const pay = (id: number) => request(app.getHttpServer()).post(`/orders/${id}/pay`)
const stats = () => prisma.dailyStats.findMany({ select: { day: true, orders: true, revenue: true } })

describe('練習 5：當日統計與 listener 的錯誤', () => {
  it('付款兩張訂單：今天（台北時間）的統計是 2 張、300 元', async () => {
    const before = taipeiDay(new Date())
    expect((await pay(1)).status).toBe(200)
    await vi.waitFor(async () => expect((await stats()).length, "StatsListener.handleOrderPaid 要加上 @OnEvent('order.paid', { async: true })，upsert daily_stats").toBe(1), { timeout: 3000, interval: 50 })
    expect((await pay(2)).status).toBe(200)
    const after = taipeiDay(new Date())
    await vi.waitFor(async () => {
      const rows = await stats()
      expect(rows.length, '同一天只有一列：用 upsert，第二次付款是 orders + 1、revenue + total（increment）').toBe(1)
      expect([before, after], `day 要是 taipeiDay(event.paidAt)，現在是 ${rows[0].day}`).toContain(rows[0].day)
      expect([rows[0].orders, rows[0].revenue], '2 張訂單、190 + 110 元').toEqual([2, 300])
    }, { timeout: 3000, interval: 50 })
  })

  it('StatsListener 出錯：付款照樣成功、廚房照樣收到通知，並留下 error log', async () => {
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    // 模擬統計資料表暫時不能寫入：把表改名，listener 寫入就會出錯
    await prisma.$executeRawUnsafe('ALTER TABLE daily_stats RENAME TO daily_stats_offline')
    try {
      const res = await pay(1)
      expect(res.status, `統計失敗不能讓付款失敗：${JSON.stringify(res.body)}。不要在 @OnEvent 設 suppressErrors: false，也不要 await emitAsync 把錯誤帶回付款`).toBe(200)
      await vi.waitFor(async () => expect(await prisma.kitchenNotice.count(), '一個 listener 出錯，不影響另一個').toBe(1), { timeout: 3000, interval: 50 })
      await vi.waitFor(() => expect(logError.mock.calls.some(c => c.join(' ').includes('daily_stats')), 'listener 的錯誤要留下 error log：@nestjs/event-emitter 預設（suppressErrors: true）會用 Logger.error 記下來；自己 try/catch 把錯誤吞掉、什麼都沒記，出事時就查不到').toBe(true), { timeout: 3000, interval: 50 })
      expect((await prisma.order.findUniqueOrThrow({ where: { id: 1 } })).status).toBe('paid')
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE daily_stats_offline RENAME TO daily_stats')
      logError.mockRestore()
    }
  })
})
