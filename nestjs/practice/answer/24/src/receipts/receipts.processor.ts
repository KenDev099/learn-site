import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger, type BeforeApplicationShutdown } from '@nestjs/common'
import { UnrecoverableError, type Job } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service.js'
import { Mailer } from './mailer.js'
import { RECEIPTS_QUEUE, type ReceiptJobData } from './receipts.producer.js'

// 第 20 課的消費者（worker）
@Processor(RECEIPTS_QUEUE)
export class ReceiptsProcessor extends WorkerHost implements BeforeApplicationShutdown {
  private readonly logger = new Logger(ReceiptsProcessor.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
  ) {
    super()
  }

  async process(job: Job<ReceiptJobData>) {
    const { orderId } = job.data
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { receiptSentAt: true, customer: { select: { email: true } } },
    })
    if (!order) throw new UnrecoverableError(`找不到訂單 ${orderId}`)
    if (order.receiptSentAt) return { skipped: true }
    await this.mailer.sendReceipt(order.customer.email, orderId)
    await this.prisma.order.update({ where: { id: orderId }, data: { receiptSentAt: new Date() } })
    this.logger.log('收據工作完成', { orderId, jobId: job.id })
    return { skipped: false }
  }

  // @nestjs/bullmq 要到 onApplicationShutdown 才關 worker，那時 PrismaService 可能已經斷線。
  // 在前一個階段自己關：close() 不再拿新工作，等手上的工作做完才 resolve
  async beforeApplicationShutdown() {
    await this.worker.close()
  }
}
