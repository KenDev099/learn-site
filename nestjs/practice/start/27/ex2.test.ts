// 練習 2：付款 webhook → 同一個交易寫 outbox → OutboxRelay → loyalty／notifications 的 worker
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getQueueToken } from '@nestjs/bullmq'
import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Queue } from 'bullmq'
import { createHmac } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import request from 'supertest'
import { AppModule } from './src/app.module.js'
import { configureApp } from './src/app.setup.js'
import { LoyaltyService } from './src/loyalty/loyalty.service.js'
import { Mailer } from './src/notifications/mailer.js'
import { OutboxRelay } from './src/outbox/outbox.relay.js'
import { OutboxService } from './src/outbox/outbox.service.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

// 判分時不讀 .env：測試要的設定在這裡給（vi.hoisted 在所有 import 之前執行）
vi.hoisted(() => {
  process.env.PAYMENT_WEBHOOK_SECRET = 'test-only-webhook-secret-0123456789'
  process.env.ADMIN_KEY = 'test-only-admin-key-0123456789'
})

let app: INestApplication
let prisma: PrismaService
let mailer: Mailer
const queues = () => ['loyalty', 'notifications'].map(n => app.get<Queue>(getQueueToken(n)))

beforeAll(async () => {
  app = await createTestApp(AppModule, { configure: configureApp, options: { logger: false, rawBody: true } })
  prisma = app.get(PrismaService)
  mailer = app.get(Mailer)
})
afterAll(async () => {
  vi.restoreAllMocks()
  await app?.close()
})
beforeEach(async () => {
  vi.restoreAllMocks()
  await resetDb(prisma)
  for (const q of queues()) await q.obliterate({ force: true })   // id 從 1 重來：清掉上一個測試的工作，jobId 才不會被當成重複
  mailer.sent.length = 0
  await prisma.customer.create({ data: { name: '王小明', email: 'ming@example.com' } })
  await prisma.category.create({ data: { name: '咖啡' } })
  await prisma.product.create({ data: { categoryId: 1, name: '拿鐵', price: 110, stock: 20 } })
  // 訂單 1：顧客 1、2 杯拿鐵 220 元、待付款
  await prisma.order.create({ data: { customerId: 1, total: 220, items: { create: [{ productId: 1, name: '拿鐵', unitPrice: 110, quantity: 2 }] } } })
})

function webhook(eventId: string, orderId = 1, { badSignature = false } = {}) {
  const body = JSON.stringify({ id: eventId, type: 'payment.succeeded', data: { orderId } })
  const t = Math.floor(Date.now() / 1000)
  const secret = app.get(ConfigService).getOrThrow<string>('PAYMENT_WEBHOOK_SECRET')
  const v1 = createHmac('sha256', badSignature ? 'wrong-secret-wrong-secret' : secret).update(`${t}.${body}`).digest('hex')
  return request(app.getHttpServer()).post('/api/v1/webhooks/payments')
    .set('Content-Type', 'application/json').set('X-Signature', `t=${t},v1=${v1}`).send(body)
}

async function drain() {
  for (let i = 0; ; i++) {
    try { await app.get(OutboxRelay).publishPending(); break } catch (e) { if (i === 2) throw e }
  }
  await vi.waitFor(async () => {
    const counts = await Promise.all(queues().map(q => q.getJobCounts('waiting', 'active', 'delayed', 'prioritized')))
    expect(counts.every(c => Object.values(c).every(n => n === 0)), '佇列裡的工作要在時間內做完').toBe(true)
  }, { timeout: 15_000, interval: 50 })
}

const points = async () => (await prisma.pointTransaction.aggregate({ _sum: { points: true } }))._sum.points ?? 0
const outboxTypes = async () => (await prisma.outboxEvent.findMany({ orderBy: { type: 'asc' } })).map(e => e.type)
const receiptsFor = (orderId: number) => mailer.sent.filter(m => m.subject.includes(`訂單 ${orderId}`))

describe('練習 2：付款到集點、收據', () => {
  it('付款 webhook：訂單 paid，outbox 有 order.paid 與 receipt.requested；relay 送出後加 2 點、寄一封收據', async () => {
    const res = await webhook('evt_1')
    expect(res.status, res.text).toBe(200)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: 1 } })).status).toBe('paid')
    expect(await outboxTypes(), '同一個交易裡寫兩筆 outbox：order.paid（給 loyalty）與 receipt.requested（給 notifications），用 OutboxService.add(tx, …)').toEqual(['order.paid', 'receipt.requested'])
    const payload = (await prisma.outboxEvent.findFirstOrThrow({ where: { type: 'order.paid' } })).payload
    expect(payload, 'payload 帶 loyalty 需要的事實：{ orderId, customerId, total }').toEqual({ orderId: 1, customerId: 1, total: 220 })
    await drain()
    expect(await points(), '220 元要加 2 點').toBe(2)
    expect(receiptsFor(1), '要寄出一封收據').toHaveLength(1)
  })

  it('同一個 webhook 重送兩次：都回 200，outbox 不會多寫，點數與收據都只有一份', async () => {
    for (let i = 0; i < 3; i++) expect((await webhook('evt_1')).status, '重送的事件也要回 200，不然金流公司會一直重送').toBe(200)
    expect(await outboxTypes(), '重送的事件不能再寫 outbox：webhook_events.event_id 唯一，撞到（P2002）就當成已處理').toEqual(['order.paid', 'receipt.requested'])
    await drain()
    expect(await points()).toBe(2)
    expect(receiptsFor(1)).toHaveLength(1)
  })

  it('不同的事件 id、同一張已付款的訂單：不會再寫 outbox', async () => {
    expect((await webhook('evt_1')).status).toBe(200)
    expect((await webhook('evt_2')).status).toBe(200)
    expect(await outboxTypes(), '訂單已經是 paid：markPaid 回傳 null 時不寫 outbox').toEqual(['order.paid', 'receipt.requested'])
  })

  it('webhook 進來時佇列（Redis）暫時連不上：照樣回 200，relay 之後送出，點數與收據都會補上', async () => {
    const add = vi.spyOn(Queue.prototype, 'add').mockRejectedValue(new Error('Connection is closed.'))
    let res
    try {
      res = await webhook('evt_1')
    } finally {
      add.mockRestore()
    }
    expect(res.status, `佇列連不上時 webhook 也要 200（收到 ${res.status}）：handle() 裡不要直接送進佇列，在交易裡寫 outbox，交給 OutboxRelay`).toBe(200)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: 1 } })).status).toBe('paid')
    await drain()
    expect(await points(), '佇列恢復、relay 送出之後要加上點數：交易提交後才直接送進佇列的話，這一次就永遠遺失了').toBe(2)
    expect(receiptsFor(1)).toHaveLength(1)
  })

  it('寫 outbox 時失敗：整個 webhook 回滾，金流公司重送同一個事件時要補上點數與收據', async () => {
    const add = vi.spyOn(app.get(OutboxService), 'add').mockRejectedValueOnce(new Error('寫入 outbox 時連線中斷'))
    await webhook('evt_1')   // 這一次失敗（5xx），金流公司之後會重送
    expect(add, '用 this.outbox.add(tx, …) 寫 outbox').toHaveBeenCalled()
    expect((await webhook('evt_1')).status, '重送的事件要回 200').toBe(200)
    await drain()
    expect(await points(), 'outbox 沒寫成功時，webhook_events 與訂單的 paid 也要一起回滾：outbox.add 要傳交易的 tx、在 $transaction 裡面呼叫。在交易提交之後才寫 outbox，重送時 event_id 已經記錄過、被當成重複，這次的點數與收據就永遠遺失了').toBe(2)
    expect(receiptsFor(1)).toHaveLength(1)
  })

  it('加點的工作做完、回報前失敗而被重試：點數還是只加一次，工作最後是成功的', async () => {
    const loyalty = app.get(LoyaltyService)
    const real = loyalty.earnForOrder.bind(loyalty)
    const spy = vi.spyOn(loyalty, 'earnForOrder').mockImplementationOnce(async input => {
      await real(input)
      throw new Error('寫入點數後連線逾時')   // 點數已經寫進去，但 worker 以為失敗 → BullMQ 1 秒後重試
    })
    expect((await webhook('evt_1')).status).toBe(200)
    await drain()
    await vi.waitFor(async () => expect(spy.mock.calls.length, 'LoyaltyProcessor 要呼叫 LoyaltyService.earnForOrder；失敗後 BullMQ 會重試').toBeGreaterThanOrEqual(2), { timeout: 15_000, interval: 100 })
    await drain()
    expect(await points(), '重試不能再加一次點').toBe(2)
    const states = await Promise.all((await queues()[0].getJobs(['completed', 'failed'])).map(j => j.getState()))
    expect(states, '重試的工作要成功（completed），不能靠唯一約束的錯誤擋下來：同一張訂單已經加過點就當成完成（例如 createMany 加 skipDuplicates，或接住 P2002）').toEqual(['completed'])
  })

  it('簽章不對：401，訂單還是 pending，沒有 outbox', async () => {
    expect((await webhook('evt_1', 1, { badSignature: true })).status).toBe(401)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: 1 } })).status).toBe('pending')
    expect(await outboxTypes()).toEqual([])
  })

  it('資料歸屬：只有 src/loyalty 會碰 stampCard、pointTransaction；src/payments 與 src/orders 不 import src/loyalty', () => {
    const SRC = join(import.meta.dirname, 'src')
    const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.startsWith('generated/'))
    const code = (f: string) => readFileSync(join(SRC, f), 'utf8').replace(/^\s*\/\/.*$/gm, '')
    const touching = files.filter(f => !f.startsWith('loyalty/') && /\.(stampCard|pointTransaction)\b/.test(code(f)))
    expect(touching, '這些檔案直接寫 loyalty 的資料表：加點只能在 LoyaltyService 裡，由 loyalty 的 worker 處理 order.paid').toEqual([])
    const bad = files.filter(f => f.startsWith('payments/') || f.startsWith('orders/')).flatMap(f =>
      [...code(f).matchAll(/from\s*['"](\.[^'"]+)['"]/g)]
        .map(m => relative(SRC, resolve(dirname(join(SRC, f)), m[1])))
        .filter(t => t.startsWith('loyalty/'))
        .map(t => `${f} → ${t}`))
    expect(bad, 'payments、orders 不認識 loyalty：只寫 order.paid 到 outbox，誰要處理自己去接').toEqual([])
  })
})
