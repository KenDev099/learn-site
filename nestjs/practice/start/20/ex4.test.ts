// 練習 4：transactional outbox。OrdersService.pay 寫 outbox_events，OutboxRelay.publishPending 送進佇列
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import type { Job, Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { readFileSync } from 'node:fs'
import request from 'supertest'
import { AppModule } from './src/app.module.js'
import { OutboxRelay } from './src/outbox/outbox.relay.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { ReceiptsProcessor } from './src/receipts/receipts.processor.js'
import { ReceiptsProducer } from './src/receipts/receipts.producer.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

async function wipeRedis() {
  const redis = new Redis(process.env.REDIS_URL!)
  const keys = await redis.keys(`${process.env.REDIS_PREFIX}*`)
  if (keys.length) await redis.del(...keys)
  redis.disconnect()
}

let app: INestApplication
let queue: Queue
let prisma: PrismaService
let relay: OutboxRelay
let producer: ReceiptsProducer
beforeAll(async () => {
  await wipeRedis()
  // 這一題只看佇列裡有哪些工作，不讓 worker 把它們取走
  app = await createTestApp(AppModule, { override: b => b.overrideProvider(ReceiptsProcessor).useValue({}) })
  queue = app.get(getQueueToken('receipts'))
  prisma = app.get(PrismaService)
  relay = app.get(OutboxRelay)
  producer = app.get(ReceiptsProducer)
})
afterAll(() => app?.close())
beforeEach(async () => {
  vi.restoreAllMocks()
  await queue.obliterate({ force: true })   // 清空佇列（obliterate 會先暫停佇列，所以接著 resume）
  await queue.resume()
  await resetDb(prisma)
  await prisma.customer.create({ data: { name: '王小明', email: 'ming@example.com' } })
  await prisma.order.createMany({ data: Array.from({ length: 20 }, () => ({ customerId: 1, total: 110 })) })
})

const pay = (id: number) => request(app.getHttpServer()).post(`/orders/${id}/pay`)
const jobIds = async () => ((await queue.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed'])) as Job[]).map(j => j.id).sort()
const outbox = () => prisma.outboxEvent.findMany({ orderBy: { id: 'asc' } })

describe('練習 4：transactional outbox', () => {
  it('付款時在同一個交易寫入 outbox_events，不直接放進佇列', async () => {
    const res = await pay(1)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.status).toBe('paid')
    const rows = await outbox()
    expect(rows.length, '付款後 outbox_events 要多一筆').toBe(1)
    expect(rows[0].type).toBe('receipt.requested')
    expect(rows[0].payload, "payload 是 { orderId }").toEqual({ orderId: 1 })
    expect(rows[0].publishedAt, '還沒送進佇列，published_at 是 null').toBeNull()
    expect(await jobIds(), 'pay 裡不要直接放進佇列：只寫 outbox，交給 relay 送').toEqual([])
  })

  it('交易在 COMMIT 時失敗：訂單沒改、沒有 outbox，也沒有任何工作', async () => {
    // 讓 orders 的修改在 COMMIT 那一刻失敗（DEFERRABLE INITIALLY DEFERRED 的觸發器在 COMMIT 才檢查）
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION ex4_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'ex4：模擬 COMMIT 失敗'; END $$ LANGUAGE plpgsql`)
    await prisma.$executeRawUnsafe(`CREATE CONSTRAINT TRIGGER ex4_fail AFTER UPDATE ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ex4_fail()`)
    try {
      const res = await pay(2)
      expect(res.status, '交易失敗應該回 500').toBe(500)
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS ex4_fail ON orders')
    }
    expect((await prisma.order.findUniqueOrThrow({ where: { id: 2 } })).status).toBe('pending')
    expect(await outbox(), 'outbox_events 要跟訂單一起回滾：用交易的 tx 寫入').toEqual([])
    expect(await jobIds(), '交易回滾了，佇列裡卻有工作：不要在付款的交易裡呼叫 enqueue／queue.add').toEqual([])
  })

  it('Redis 暫時連不上：付款照樣成功，事件留在 outbox，之後由 relay 送出', async () => {
    const add = vi.spyOn(queue, 'add').mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6380'))
    const res = await pay(3)
    expect(res.status, '付款不能因為佇列失敗而失敗：pay 裡不要呼叫 enqueue，只寫 outbox').toBe(200)
    expect((await outbox()).map(r => r.publishedAt), '事件要留在 outbox，還沒送出').toEqual([null])

    await expect(relay.publishPending(), 'Redis 還連不上時，relay 應該失敗').rejects.toThrow()
    expect((await outbox()).map(r => r.publishedAt), 'queue.add 失敗了，事件卻被標成已送出（或被刪掉）：送進佇列成功之後才標記，而且要在同一個交易裡').toEqual([null])

    add.mockRestore()
    expect(await relay.publishPending(), 'Redis 恢復後，publishPending 回傳送出的筆數').toBe(1)
    expect(await jobIds()).toEqual(['receipt-3'])
    expect((await outbox())[0].publishedAt, '送出後要設定 published_at').toBeInstanceOf(Date)
    expect(await relay.publishPending(), '已經送出的不能再送').toBe(0)
  })

  it('送進佇列後、標記前當機：下次重送也只會有一個工作', async () => {
    await pay(4)
    const real = producer.enqueue.bind(producer)
    vi.spyOn(producer, 'enqueue').mockImplementationOnce(async orderId => {
      await real(orderId)
      throw new Error('模擬：工作已經放進佇列，程序在標記 published_at 之前當機')
    })
    await expect(relay.publishPending()).rejects.toThrow()
    expect((await outbox())[0].publishedAt, '當機時交易要回滾，事件維持未送出').toBeNull()
    await relay.publishPending()
    expect(await jobIds(), '重送時靠 jobId 去重：relay 呼叫 ReceiptsProducer.enqueue（練習 1）').toEqual(['receipt-4'])
    expect((await outbox())[0].publishedAt).toBeInstanceOf(Date)
  })

  it('兩個 relay 同時跑：20 筆事件，每一張訂單只被送一次', async () => {
    for (let id = 1; id <= 20; id++) await pay(id)
    const sent: number[] = []
    const real = producer.enqueue.bind(producer)
    vi.spyOn(producer, 'enqueue').mockImplementation(async orderId => {
      sent.push(orderId)
      await new Promise(r => setTimeout(r, 5))
      return real(orderId)
    })
    const counts = await Promise.all([relay.publishPending(), relay.publishPending()])
    expect(sent.sort((a, b) => a - b), '同一張訂單被兩個 relay 都送了：取事件時要鎖住那幾列（FOR UPDATE SKIP LOCKED）').toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    expect(counts[0] + counts[1]).toBe(20)
    expect((await outbox()).every(r => r.publishedAt), '20 筆都要標記成已送出').toBe(true)
  })

  it('一次最多取 50 筆，而且用 FOR UPDATE SKIP LOCKED', async () => {
    await prisma.outboxEvent.createMany({ data: Array.from({ length: 60 }, (_, i) => ({ type: 'receipt.requested', payload: { orderId: 100 + i } })) })
    expect(await relay.publishPending(), '一次最多 50 筆：批次小，交易才短').toBe(50)
    expect(await relay.publishPending()).toBe(10)
    const code = readFileSync(new URL('./src/outbox/outbox.relay.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(/FOR\s+UPDATE\s+SKIP\s+LOCKED/i.test(code), '只寫 FOR UPDATE 時，第二個 relay 會停下來等第一個做完；加上 SKIP LOCKED 直接跳過別人鎖住的列').toBe(true)
  })
})
