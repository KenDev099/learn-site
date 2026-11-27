import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { RequestLogger } from '../logging/request.logger.js'
import type { Queue } from 'bullmq'

export const RECEIPTS_QUEUE = 'receipts'
export type ReceiptJobData = { orderId: number }

// 第 20 課的生產者
@Injectable()
export class ReceiptsProducer {
  constructor(
    @InjectQueue(RECEIPTS_QUEUE) private readonly queue: Queue<ReceiptJobData>,
    private readonly logger: RequestLogger,
  ) {}

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
