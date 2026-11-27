// 練習 1：ReceiptsProducer.enqueue(orderId)
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import type { Job, Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { AppModule } from './src/app.module.js'
import { ReceiptsProcessor } from './src/receipts/receipts.processor.js'
import { ReceiptsProducer } from './src/receipts/receipts.producer.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

// 每個測試檔從乾淨的佇列開始：刪掉這一題判分用的 key
async function wipeRedis() {
  const redis = new Redis(process.env.REDIS_URL!)
  const keys = await redis.keys(`${process.env.REDIS_PREFIX}*`)
  if (keys.length) await redis.del(...keys)
  redis.disconnect()
}

let app: INestApplication
let queue: Queue
let producer: ReceiptsProducer
beforeAll(async () => {
  await wipeRedis()
  // 這一題只看放進佇列的工作，不讓 worker 把它們取走
  app = await createTestApp(AppModule, { override: b => b.overrideProvider(ReceiptsProcessor).useValue({}) })
  queue = app.get(getQueueToken('receipts'))
  producer = app.get(ReceiptsProducer)
  // 訂單 7、8 真的存在：把查出來的整筆訂單塞進 data 的寫法才會被抓到
  const prisma = app.get(PrismaService)
  await resetDb(prisma)
  await prisma.customer.create({ data: { id: 1, name: '王小明', email: 'ming@example.com' } })
  await prisma.order.createMany({ data: [{ id: 7, customerId: 1, total: 190 }, { id: 8, customerId: 1, total: 80 }] })
})
afterAll(() => app?.close())

const allJobs = async () => (await queue.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed'])) as Job[]

describe('練習 1：ReceiptsProducer.enqueue', () => {
  it('同一張訂單呼叫兩次，佇列裡只有一個工作，id 是 receipt-<orderId>', async () => {
    await producer.enqueue(7)
    await producer.enqueue(7)
    const jobs = await allJobs()
    expect(jobs.length, '同一張訂單 enqueue 兩次就有兩個工作：add 的選項要加 jobId').toBe(1)
    expect(jobs[0].id, 'jobId 要是 `receipt-${orderId}`（BullMQ 的自訂 id 不能含冒號、不能是純數字）').toBe('receipt-7')
    expect(jobs[0].name, '工作名稱是 send-receipt').toBe('send-receipt')
  })

  it('不同訂單是不同的工作', async () => {
    await producer.enqueue(8)
    const job = await queue.getJob('receipt-8')
    expect(job, '找不到 receipt-8：jobId 要用傳進來的 orderId 組出來').toBeDefined()
  })

  it('data 只放 { orderId }', async () => {
    const job = await queue.getJob('receipt-7')
    expect(job?.data, 'job data 只放 orderId：worker 處理時再查最新的訂單與顧客資料').toEqual({ orderId: 7 })
  })

  it('最多做 3 次、指數退避，並設定自動清除', async () => {
    const job = await queue.getJob('receipt-7')
    expect(job?.opts.attempts, 'attempts 要是 3：預設只做 1 次，失敗就不再試').toBe(3)
    const backoff = job?.opts.backoff
    expect(typeof backoff === 'object' ? backoff.type : backoff, "backoff 要是 { type: 'exponential', delay: … }").toBe('exponential')
    expect(typeof backoff === 'object' && (backoff.delay ?? 0) > 0, 'backoff.delay 要大於 0（毫秒）').toBe(true)
    const keep = job?.opts.removeOnComplete
    expect(keep, '要設定 removeOnComplete（例如 { age: 24 * 3600 }）：完成的工作全部留著，Redis 的記憶體會一直長').toBeTruthy()
    const keeps = typeof keep === 'number' ? keep > 0 : typeof keep === 'object' && ((keep.age ?? 0) > 0 || (keep.count ?? 0) > 0)
    expect(keeps, 'removeOnComplete: true 會在完成時馬上刪掉工作，jobId 去重就跟著失效：用 { age: 秒數 } 或 { count: 筆數 } 保留一段時間').toBe(true)
  })
})
