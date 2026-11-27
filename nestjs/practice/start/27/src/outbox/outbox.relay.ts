import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service.js'
import type { OutboxMessage } from './events.js'
import { QueuePublisher } from './queue.publisher.js'

// 第 20、21 課的 relay：每秒把 outbox_events 裡還沒送出的訊息送進佇列
@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: QueuePublisher,
  ) {}

  @Interval(1000)
  async tick() {
    try {
      await this.publishPending()
    } catch (e) {
      this.logger.warn('outbox 送出失敗，下一秒再試', { error: e instanceof Error ? e.message : String(e) })
    }
  }

  // 回傳這次送出幾筆。SKIP LOCKED：多台伺服器同時跑也不會重複拿到同一列
  publishPending(): Promise<number> {
    return this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<(OutboxMessage & { id: number })[]>`
        SELECT id, type, payload FROM outbox_events
        WHERE published_at IS NULL
        ORDER BY id
        LIMIT 50
        FOR UPDATE SKIP LOCKED`
      // jobId 用 outbox 的 id：送到一半當機、下次重送時，佇列會擋下重複的工作
      for (const row of rows) await this.publisher.publish(row, `outbox-${row.id}`)
      await tx.outboxEvent.updateMany({ where: { id: { in: rows.map(r => r.id) } }, data: { publishedAt: new Date() } })
      return rows.length
    })
  }
}
