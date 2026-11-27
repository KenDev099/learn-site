import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import { UnrecoverableError, type Job } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service.js'
import { InvalidRecipientError, Mailer } from './mailer.js'
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

  async process(job: Job<ReceiptJobData>) {
    const { orderId } = job.data
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { receiptSentAt: true, customer: { select: { email: true } } },
    })
    if (!order) throw new UnrecoverableError(`找不到訂單 ${orderId}`)
    if (order.receiptSentAt) return { skipped: true }   // 冪等：已經寄過就不再寄

    await this.prisma.order.update({ where: { id: orderId }, data: { receiptSentAt: new Date() } })
    try {
      await this.mailer.sendReceipt(order.customer.email, orderId)
    } catch (error) {
      // 永久性錯誤：重試也不會好，直接進 failed；其他錯誤照樣丟出，交給 BullMQ 重試
      if (error instanceof InvalidRecipientError) throw new UnrecoverableError(error.message)
      throw error
    }
    // 寄成功之後才標記：標記失敗頂多重寄一次，先標記則可能永遠沒寄
    return { skipped: false }
  }

  // 每一次失敗都會觸發（包含之後還會重試的那幾次）
  @OnWorkerEvent('failed')
  onFailed(job: Job<ReceiptJobData> | undefined, error: Error) {
    this.logger.error(`訂單 ${job?.data.orderId} 的收據寄送失敗（第 ${job?.attemptsMade} 次）：${error.message}`)
  }
}
