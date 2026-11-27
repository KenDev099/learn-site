import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { ReceiptsProducer } from '../receipts/receipts.producer.js'

// relay：把 outbox_events 裡還沒送出的事件送進佇列。第 21 課會用 @Interval 每秒呼叫一次
@Injectable()
export class OutboxRelay {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: ReceiptsProducer,
  ) {}

  async publishPending(): Promise<number> {
    return this.prisma.$transaction(async tx => {
      // SKIP LOCKED：別的 relay 正在送的列直接跳過，每一列只會被一個 relay 拿到，也不用互相等
      const events = await tx.$queryRaw<{ id: number; payload: { orderId: number } }[]>`
        SELECT id, payload FROM outbox_events
        WHERE published_at IS NULL AND type = 'receipt.requested'
        ORDER BY id
        LIMIT 50
        FOR UPDATE SKIP LOCKED`
      await tx.outboxEvent.deleteMany({ where: { id: { in: events.map(e => e.id) } } })
      return events
    }).then(async events => {
      for (const event of events) await this.receipts.enqueue(event.payload.orderId)
      return events.length
    })
  }
}
