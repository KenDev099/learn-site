// e2e 測試的工具（已經寫好，練習 3 直接用）。測試只透過 HTTP 操作，不 mock PrismaService：
// 要驗證的是交易、唯一約束、佇列這些真的元件放在一起時的行為
import { getQueueToken } from '@nestjs/bullmq'
import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import type { Queue } from 'bullmq'
import { createHmac } from 'node:crypto'
import request from 'supertest'
import { AppModule } from '../../src/app.module.js'
import { configureApp } from '../../src/app.setup.js'
import { Mailer } from '../../src/notifications/mailer.js'
import { LOYALTY_QUEUE, NOTIFICATIONS_QUEUE } from '../../src/outbox/events.js'
import { OutboxRelay } from '../../src/outbox/outbox.relay.js'
import { PrismaService } from '../../src/prisma/prisma.service.js'

// 跟 main.ts 一樣的設定（rawBody 是驗 webhook 簽章要的），但不印 log
export async function createApp(): Promise<INestApplication> {
  const ref = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const app = ref.createNestApplication({ rawBody: true, logger: false })
  configureApp(app)
  await app.init()
  return app
}

const queues = (app: INestApplication) => [LOYALTY_QUEUE, NOTIFICATIONS_QUEUE].map(name => app.get<Queue>(getQueueToken(name)))

// 每個測試前呼叫：清空所有資料表（id 從 1 開始）、清掉佇列裡的工作和假信箱，再放入固定的資料：
//   顧客 1 王小明、2 陳美華；商品 1 美式咖啡 80 元 庫存 10、2 拿鐵 110 元 庫存 10、3 起司蛋糕 120 元 庫存 2
export async function resetAll(app: INestApplication) {
  const prisma = app.get(PrismaService)
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map(t => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`)
  // id 重新從 1 開始，上一個測試留下的 outbox-1 工作會讓這次的 outbox-1 被當成重複：一起清掉
  for (const queue of queues(app)) await queue.obliterate({ force: true })
  app.get(Mailer).sent.length = 0
  await prisma.customer.createMany({ data: [{ name: '王小明', email: 'ming@example.com' }, { name: '陳美華', email: 'meihua@example.com' }] })
  await prisma.category.create({ data: { name: '咖啡' } })
  await prisma.product.createMany({ data: [
    { categoryId: 1, name: '美式咖啡', price: 80, stock: 10 },
    { categoryId: 1, name: '拿鐵', price: 110, stock: 10 },
    { categoryId: 1, name: '起司蛋糕', price: 120, stock: 2 },
  ] })
}

// 模擬金流公司送來 payment.succeeded：用 PAYMENT_WEBHOOK_SECRET 簽章，回傳 supertest 的回應
export function sendPaymentWebhook(app: INestApplication, event: { id: string; orderId: number }) {
  const body = JSON.stringify({ id: event.id, type: 'payment.succeeded', data: { orderId: event.orderId } })
  const t = Math.floor(Date.now() / 1000)
  const secret = app.get(ConfigService).getOrThrow<string>('PAYMENT_WEBHOOK_SECRET')
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  return request(app.getHttpServer()).post('/api/v1/webhooks/payments')
    .set('Content-Type', 'application/json').set('X-Signature', `t=${t},v1=${v1}`).send(body)
}

// 把 outbox 裡的訊息送進佇列，等 worker 把工作都做完（含重試）。之後才檢查點數與收據
export async function drain(app: INestApplication, timeout = 10_000) {
  // relay 每秒也會自己跑；這裡再叫一次讓測試不用等。機器很忙時交易可能拿不到連線，失敗就重試
  for (let i = 0; ; i++) {
    try { await app.get(OutboxRelay).publishPending(); break } catch (e) { if (i === 2) throw e }
  }
  const deadline = Date.now() + timeout
  for (;;) {
    const counts = await Promise.all(queues(app).map(q => q.getJobCounts('waiting', 'active', 'delayed', 'prioritized', 'waiting-children')))
    if (counts.every(c => Object.values(c).every(n => n === 0))) return
    if (Date.now() > deadline) throw new Error(`佇列 ${timeout / 1000} 秒內沒有清空：${JSON.stringify(counts)}`)
    await new Promise(r => setTimeout(r, 50))
  }
}

// 假信箱裡寄出的收據
export const receipts = (app: INestApplication) => app.get(Mailer).sent
