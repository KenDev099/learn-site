// 練習 3：webhook 冪等
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

process.env.PAYMENT_WEBHOOK_SECRET ??= 'test-webhook-secret-0123456789'
const { AppModule } = await import('./src/app.module.js')
const { PrismaService } = await import('./src/prisma/prisma.service.js')
const { WebhookSignatureGuard } = await import('./src/webhooks/webhook-signature.guard.js')

let app: INestApplication
let prisma: InstanceType<typeof PrismaService>
beforeAll(async () => {
  // 這一題只看冪等：簽章檢查換成一律放行（練習 2 另外判）
  app = await createTestApp(AppModule, { override: b => b.overrideGuard(WebhookSignatureGuard).useValue({ canActivate: () => true }) })
  prisma = app.get(PrismaService)
})
afterAll(() => app?.close())
beforeEach(async () => {
  await resetDb(prisma)
  await prisma.order.create({ data: { total: 190 } })
})

const send = (id: string, orderId = 1) =>
  request(app.getHttpServer()).post('/webhooks/payments').send({ id, type: 'payment.succeeded', data: { orderId } })
const events = () => prisma.webhookEvent.findMany({ orderBy: { id: 'asc' } })
const order = () => prisma.order.findUniqueOrThrow({ where: { id: 1 } })

describe('練習 3：同一個事件只處理一次', () => {
  it('webhook_events.event_id 有唯一約束', async () => {
    const rows = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'webhook_events'`)
    const unique = rows.some(r => /UNIQUE/i.test(r.indexdef) && /\(\s*"?event_id"?\s*\)/.test(r.indexdef))
    expect(unique, '在 schema.prisma 的 eventId 加上 @unique，再執行 npx prisma migrate dev --name webhook-event-unique 產生 migration').toBe(true)
  })

  it('處理一個事件：200、訂單 paid、記一筆 processed', async () => {
    const res = await send('evt_1')
    expect(res.status, `應該回 200，收到 ${res.status}：${JSON.stringify(res.body)}`).toBe(200)
    expect((await order()).status).toBe('paid')
    const rows = await events()
    expect(rows.map(r => [r.eventId, r.status]), '要在 webhook_events 記下 eventId 與 status: processed').toEqual([['evt_1', 'processed']])
  })

  it('同一個事件同時送 5 次：都回 200，只記一筆、只付款一次', async () => {
    const res = await Promise.all([1, 2, 3, 4, 5].map(() => send('evt_dup')))
    expect(res.map(r => r.status), '重複的事件也要回 200（回 4xx／5xx 金流公司會一直重送）。同時送來時「先查再寫」擋不住：靠唯一約束，撞到 P2002 就當成處理過').toEqual([200, 200, 200, 200, 200])
    const rows = await events()
    expect(rows.length, 'webhook_events 只能有一筆 evt_dup').toBe(1)
    expect(rows[0].status).toBe('processed')
    expect((await order()).status).toBe('paid')
  })

  it('之後再重送一次：200，付款時間不變', async () => {
    await send('evt_again')
    const paidAt = (await order()).paidAt
    const res = await send('evt_again')
    expect(res.status, '已經處理過的事件回 200（不是 409）').toBe(200)
    expect((await order()).paidAt, '重送不能再改訂單').toEqual(paidAt)
    expect((await events()).length).toBe(1)
  })

  it('另一個事件 id 再付同一張已付款的訂單：200、記成 ignored、付款時間不變', async () => {
    await send('evt_first')
    const paidAt = (await order()).paidAt
    const res = await send('evt_second')
    expect(res.status).toBe(200)
    expect((await order()).paidAt, '已經是 paid 的訂單不能再改：更新條件要包含 status: pending（updateMany 的 where）').toEqual(paidAt)
    expect((await events()).map(r => [r.eventId, r.status]), '第二個事件沒有改到訂單，要記成 ignored').toEqual([['evt_first', 'processed'], ['evt_second', 'ignored']])
  })

  it('找不到可以付款的訂單：200，記成 ignored', async () => {
    const res = await send('evt_unknown', 999)
    expect(res.status, '訂單不存在也回 200：回錯誤的話金流公司會一直重送，但重送也不會變好').toBe(200)
    expect((await events()).map(r => [r.eventId, r.status]), '記一筆 status: ignored，之後查得到收過這個事件').toEqual([['evt_unknown', 'ignored']])
  })

  it('改訂單失敗時，事件不能被記成處理過：重送後要真的付款', async () => {
    const sql = [
      `CREATE SEQUENCE fail_once_seq`,
      `CREATE FUNCTION fail_once() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN IF nextval('fail_once_seq') = 1 THEN RAISE EXCEPTION '模擬：更新訂單時資料庫出錯'; END IF; RETURN NEW; END $$`,
      `CREATE TRIGGER orders_fail_once BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION fail_once()`,
    ]
    for (const s of sql) await prisma.$executeRawUnsafe(s)
    try {
      const first = await send('evt_retry')
      expect(first.status, '第一次更新訂單失敗，應該回錯誤讓金流公司重送').toBeGreaterThanOrEqual(500)
      const second = await send('evt_retry')
      expect(second.status).toBe(200)
      expect((await order()).status, '重送之後訂單還是 pending：第一次失敗時事件已經被記下來了。記錄事件和更新訂單要放在同一個 $transaction 裡').toBe('paid')
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS orders_fail_once ON orders`)
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS fail_once()`)
      await prisma.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS fail_once_seq`)
    }
  })
})
