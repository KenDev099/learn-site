import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service.js'
import { Mailer } from './mailer.js'
import { RECEIPTS_QUEUE, type ReceiptJobData } from './receipts.producer.js'

// 消費者（worker）：從 receipts 佇列取出工作來做
@Processor(RECEIPTS_QUEUE)
export class ReceiptsProcessor extends WorkerHost {
  private readonly logger = new Logger(ReceiptsProcessor.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
  ) {
    super()
  }

  // 練習 2、3：查出訂單和顧客的 email，用 this.mailer.sendReceipt(email, orderId) 寄出，再記下 receiptSentAt
  async process(job: Job<ReceiptJobData>) {
    throw new Error(`還沒寫：ReceiptsProcessor.process（訂單 ${job.data.orderId}）`)
  }
}
