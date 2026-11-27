// 練習 3：暫時性錯誤重試、永久性錯誤不重試，失敗要記 log
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger, type INestApplication } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import type { Job, Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { AppModule } from './src/app.module.js'
import { InvalidRecipientError, Mailer } from './src/receipts/mailer.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { ReceiptsProcessor } from './src/receipts/receipts.processor.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

async function wipeRedis() {
  const redis = new Redis(process.env.REDIS_URL!)
  const keys = await redis.keys(`${process.env.REDIS_PREFIX}*`)
  if (keys.length) await redis.del(...keys)
  redis.disconnect()
}

async function settle(job: Job) {
  for (let i = 0; i < 200; i++) {
    const state = await job.getState()
    if (state === 'completed' || state === 'failed') return state
    await new Promise(r => setTimeout(r, 50))
  }
  return 'timeout'
}

// 跟真的 Mailer 一樣：地址格式錯就丟 InvalidRecipientError
const mailer = { sendReceipt: vi.fn(async (to: string, _orderId: number) => { if (!to.includes('.')) throw new InvalidRecipientError(to) }) }
const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
let app: INestApplication
let queue: Queue
let prisma: PrismaService
beforeAll(async () => {
  await wipeRedis()
  app = await createTestApp(AppModule, { override: b => b.overrideProvider(Mailer).useValue(mailer) })
  queue = app.get(getQueueToken('receipts'))
  prisma = app.get(PrismaService)
})
afterAll(() => app?.close())
beforeEach(async () => {
  await resetDb(prisma)
  await prisma.customer.createMany({ data: [{ name: '王小明', email: 'ming@example.com' }, { name: '陳美華', email: 'meihua@example' }] })
  await prisma.order.createMany({ data: [{ id: 1, customerId: 1, total: 190, status: 'paid' }, { id: 42, customerId: 2, total: 110, status: 'paid' }] })
  mailer.sendReceipt.mockReset()   // 回到上面寫的預設行為
})

// 判分用很短的退避，測試才不用等好幾秒
const add = async (orderId: number, jobId: string) =>
  queue.add('send-receipt', { orderId }, { jobId, attempts: 3, backoff: { type: 'fixed', delay: 10 } })

describe('練習 3：錯誤處理', () => {
  it('寄信服務前兩次暫時失敗，第三次成功：工作完成', async () => {
    mailer.sendReceipt.mockRejectedValueOnce(new Error('ETIMEDOUT')).mockRejectedValueOnce(new Error('503 Service Unavailable'))
    const job = await add(1, 'r-1')
    expect(await settle(job), '暫時性錯誤要丟出去，讓 BullMQ 重試；不要 catch 起來當成成功').toBe('completed')
    expect((await queue.getJob('r-1'))?.attemptsMade, '應該做了 3 次').toBe(3)
    expect(mailer.sendReceipt).toHaveBeenCalledTimes(3)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: 1 } })).receiptSentAt).toBeInstanceOf(Date)
  })

  it('寄信服務一直失敗：用完 3 次進 failed，不能被當成完成', async () => {
    mailer.sendReceipt.mockRejectedValue(new Error('503 Service Unavailable'))
    const job = await add(1, 'r-2')
    expect(await settle(job), '錯誤被 catch 起來、正常 return 了：BullMQ 會以為寄成功').toBe('failed')
    expect((await queue.getJob('r-2'))?.attemptsMade).toBe(3)
    expect((await prisma.order.findUniqueOrThrow({ where: { id: 1 } })).receiptSentAt, '沒寄出去就不能標記').toBeNull()
  })

  it('email 格式錯誤：丟 UnrecoverableError，只做 1 次就進 failed', async () => {
    const job = await add(42, 'r-3')
    expect(await settle(job)).toBe('failed')
    const done = await queue.getJob('r-3')
    expect(done?.attemptsMade, '格式錯的地址重試幾次都一樣：把 InvalidRecipientError 換成 bullmq 的 UnrecoverableError 丟出').toBe(1)
    expect(done?.failedReason, 'failedReason 要保留原因（地址格式錯誤）').toContain('meihua@example')
  })

  it('失敗時用 @OnWorkerEvent(\'failed\') 記 error log，內容有訂單編號', async () => {
    const job = await add(42, 'r-4')
    await settle(job)
    await vi.waitFor(() => {
      const lines = logError.mock.calls.map(args => args.map(String).join(' '))
      expect(lines.some(l => l.includes('42')), '找不到 error log：在 processor 加 @OnWorkerEvent(\'failed\') 的方法，用 this.logger.error 記下訂單編號與原因').toBe(true)
    })
    const proto = ReceiptsProcessor.prototype as any
    const methods = Object.getOwnPropertyNames(proto)
    const events = methods.map(m => Reflect.getMetadata('bullmq:worker_events_metadata', proto[m])?.eventName)
    expect(events, "processor 要有一個加上 @OnWorkerEvent('failed') 的方法").toContain('failed')
  })
})
