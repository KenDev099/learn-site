import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import type { Queue } from 'bullmq'

export const RECEIPTS_QUEUE = 'receipts'
export type ReceiptJobData = { orderId: number }

// 第 20 課的生產者
@Injectable()
export class ReceiptsProducer {
  private readonly logger = new Logger(ReceiptsProducer.name)

  constructor(@InjectQueue(RECEIPTS_QUEUE) private readonly queue: Queue<ReceiptJobData>) {}

  async enqueue(orderId: number) {
    const job = await this.queue.add('send-receipt', { orderId }, {
      jobId: `receipt-${orderId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { age: 24 * 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
    })
    this.logger.log('收據工作已排入', { orderId, jobId: job.id })
    return job
  }
}
