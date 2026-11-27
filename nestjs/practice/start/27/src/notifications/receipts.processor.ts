import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { BeforeApplicationShutdown } from '@nestjs/common'
import type { Job } from 'bullmq'
import { NOTIFICATIONS_QUEUE, type OrderPaidPayload } from '../outbox/events.js'
import { Mailer } from './mailer.js'

// notifications 佇列的 worker：寄電子收據。把 idempotencyKey 傳給寄信服務，重試也只寄一封
@Processor(NOTIFICATIONS_QUEUE)
export class ReceiptsProcessor extends WorkerHost implements BeforeApplicationShutdown {
  constructor(private readonly mailer: Mailer) {
    super()
  }

  async process(job: Job<OrderPaidPayload>) {
    const { orderId, customerId, total } = job.data
    await this.mailer.send({
      customerId,
      subject: `收據：訂單 ${orderId}`,
      text: `訂單 ${orderId} 已付款，合計 ${total} 元`,
      idempotencyKey: `receipt-${orderId}`,
    })
  }

  async beforeApplicationShutdown() {
    await this.worker.close()
  }
}
