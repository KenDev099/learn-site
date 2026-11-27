import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { BeforeApplicationShutdown } from '@nestjs/common'
import type { Job } from 'bullmq'
import { LOYALTY_QUEUE, type OrderPaidPayload } from '../outbox/events.js'
import { LoyaltyService } from './loyalty.service.js'

// loyalty 佇列的 worker：每個 order.paid 加一次點。丟錯 → BullMQ 依 attempts／backoff 重試
@Processor(LOYALTY_QUEUE)
export class LoyaltyProcessor extends WorkerHost implements BeforeApplicationShutdown {
  constructor(private readonly loyalty: LoyaltyService) {
    super()
  }

  async process(job: Job<OrderPaidPayload>) {
    await this.loyalty.earnForOrder(job.data)
  }

  // 第 24 課：關機時先關 worker，等手上的工作做完
  async beforeApplicationShutdown() {
    await this.worker.close()
  }
}
