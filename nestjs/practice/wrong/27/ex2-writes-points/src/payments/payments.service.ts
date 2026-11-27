import { Injectable } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client.js'
import { OrdersService } from '../orders/orders.service.js'
import { OutboxService } from '../outbox/outbox.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { PaymentEvent } from './payment-event.js'

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly outbox: OutboxService,
  ) {}

  // 記錄事件、訂單變 paid、寫 outbox 在同一個交易：要嘛全部發生，要嘛都沒發生。
  // 交易裡不碰 Redis：佇列暫時連不上也能回 200，OutboxRelay 之後再送
  async handle(event: PaymentEvent) {
    try {
      await this.prisma.$transaction(async tx => {
        const order = await this.orders.markPaid(tx, event.data.orderId)
        // event_id 唯一：重送的事件在這裡撞約束，整個交易回滾（訂單、outbox 都不會再寫一次）
        await tx.webhookEvent.create({ data: { eventId: event.id, type: event.type, status: order ? 'processed' : 'ignored' } })
        if (!order) return
        const payload = { orderId: order.id, customerId: order.customerId, total: order.total }
        // 同一個交易裡直接加點：最簡單、最原子
        const points = Math.floor(order.total / 100)
        if (points > 0) {
          const card = await tx.stampCard.upsert({ where: { customerId: order.customerId }, create: { customerId: order.customerId }, update: {} })
          await tx.pointTransaction.create({ data: { cardId: card.id, orderId: order.id, points, reason: '消費' } })
        }
        await this.outbox.add(tx, { type: 'receipt.requested', payload })
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return   // 處理過的事件，當成成功
      throw e
    }
  }
}
