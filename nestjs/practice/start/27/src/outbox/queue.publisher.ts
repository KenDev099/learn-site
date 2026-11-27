import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import type { Queue } from 'bullmq'
import { LOYALTY_QUEUE, NOTIFICATIONS_QUEUE, type OutboxMessage } from './events.js'

// 把一則訊息送進對應的佇列（第 20 課的工作選項）
@Injectable()
export class QueuePublisher {
  constructor(
    @InjectQueue(LOYALTY_QUEUE) private readonly loyalty: Queue,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly notifications: Queue,
  ) {}

  publish(message: OutboxMessage, jobId: string) {
    const queue = message.type === 'order.paid' ? this.loyalty : this.notifications
    return queue.add(message.type, message.payload, {
      jobId,                                           // 同一則訊息送兩次，佇列裡也只有一個工作
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },   // 失敗後等 1 秒、2 秒再試
      removeOnComplete: { age: 24 * 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
    })
  }
}
