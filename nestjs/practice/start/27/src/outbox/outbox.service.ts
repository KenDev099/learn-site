import { Injectable } from '@nestjs/common'
import type { Prisma } from '../generated/prisma/client.js'
import type { OutboxMessage } from './events.js'

// 把要送出的訊息寫進 outbox_events。一定要傳呼叫者的 tx：跟業務資料一起提交、一起回滾
@Injectable()
export class OutboxService {
  async add(tx: Prisma.TransactionClient, ...messages: OutboxMessage[]) {
    await tx.outboxEvent.createMany({ data: messages.map(m => ({ type: m.type, payload: m.payload })) })
  }
}
