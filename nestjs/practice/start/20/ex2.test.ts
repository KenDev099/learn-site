// 練習 2：ReceiptsProcessor 寄出收據，而且冪等
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import type { Job, Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { AppModule } from './src/app.module.js'
import { Mailer } from './src/receipts/mailer.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

async function wipeRedis() {
  const redis = new Redis(process.env.REDIS_URL!)
  const keys = await redis.keys(`${process.env.REDIS_PREFIX}*`)
  if (keys.length) await redis.del(...keys)
  redis.disconnect()
}

// 等工作做完（或確定失敗）：最多 10 秒
async function settle(job: Job) {
  for (let i = 0; i < 200; i++) {
    const state = await job.getState()
    if (state === 'completed' || state === 'failed') return state
    await new Promise(r => setTimeout(r, 50))
  }
  return 'timeout'
}

const mailer = { sendReceipt: vi.fn(async (_to: string, _orderId: number) => {}) }
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
  // 訂單 1 屬於顧客 2：email 要從訂單的顧客查，不能用 orderId 當顧客 id
  await prisma.customer.createMany({ data: [{ name: '王小明', email: 'ming@example.com' }, { name: '陳美華', email: 'meihua@example.com' }] })
  await prisma.order.create({ data: { id: 1, customerId: 2, total: 190, status: 'paid' } })
  mailer.sendReceipt.mockReset()
  mailer.sendReceipt.mockResolvedValue(undefined)
})

// 同一張訂單的工作，用不同的 jobId 放兩次：模擬「至少一次」造成的重複
const run = async (jobId: string, opts = {}) => settle(await queue.add('send-receipt', { orderId: 1 }, { jobId, ...opts }))
const receiptSentAt = async () => (await prisma.order.findUniqueOrThrow({ where: { id: 1 } })).receiptSentAt

describe('練習 2：寄收據的 worker 要冪等', () => {
  it('寄給顧客的 email，並記下 receiptSentAt', async () => {
    expect(await run('t-1'), '工作沒有完成：看看 process 有沒有丟出錯誤').toBe('completed')
    expect(mailer.sendReceipt, '要用注入的 Mailer 寄：this.mailer.sendReceipt(這張訂單的顧客的 email, orderId)').toHaveBeenCalledWith('meihua@example.com', 1)
    expect(await receiptSentAt(), '寄完要把 receiptSentAt 設成現在時間').toBeInstanceOf(Date)
  })

  it('同一張訂單的工作跑兩次，只寄一封', async () => {
    await run('t-2')
    expect(await run('t-3'), '第二個工作也要正常完成，不是丟錯誤').toBe('completed')
    expect(mailer.sendReceipt, '寄了兩封：寄之前先看 receiptSentAt，已經寄過就直接 return').toHaveBeenCalledTimes(1)
  })

  it('資料庫裡已經記了 receiptSentAt（例如另一台 worker 寄過、或程序重啟過）：不再寄', async () => {
    await prisma.order.update({ where: { id: 1 }, data: { receiptSentAt: new Date('2026-01-01T00:00:00Z') } })
    expect(await run('t-5'), '已經寄過要正常結束，不是丟錯誤').toBe('completed')
    expect(mailer.sendReceipt, '寄過的訂單又寄了一次：要看資料庫裡的 receiptSentAt，程序記憶體裡的紀錄在重啟或多台 worker 時就不見了').not.toHaveBeenCalled()
  })

  it('寄信失敗時不能標記成已寄，重試後要真的寄出', async () => {
    mailer.sendReceipt.mockRejectedValueOnce(new Error('寄信服務暫時無法連線'))
    expect(await run('t-4', { attempts: 2, backoff: { type: 'fixed', delay: 10 } }), '第二次應該成功').toBe('completed')
    expect(mailer.sendReceipt, '重試時沒有再寄：receiptSentAt 要在寄成功之後才設定，先設定的話第一次失敗就再也不會寄').toHaveBeenCalledTimes(2)
    expect(await receiptSentAt()).toBeInstanceOf(Date)
  })
})
