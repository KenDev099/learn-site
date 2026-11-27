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
      // 有意識的例外：在交易裡呼叫 Redis。只鎖住 outbox 這幾列、批次小，時間很短
      for (const event of events) await this.receipts.enqueue(event.payload.orderId)
      // 全部送進佇列之後才標記。在這之前當機：交易回滾、下次重送，靠 jobId 去重和冪等的 worker 收尾
      await tx.outboxEvent.updateMany({ where: { id: { in: events.map(e => e.id) } }, data: { publishedAt: new Date() } })
      return events.length
    })
  }
}
