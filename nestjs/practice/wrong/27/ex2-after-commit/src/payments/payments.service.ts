import { Injectable } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client.js'
import { OrdersService } from '../orders/orders.service.js'
import type { OrderPaidPayload } from '../outbox/events.js'
import { OutboxService } from '../outbox/outbox.service.js'
import { QueuePublisher } from '../outbox/queue.publisher.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { PaymentEvent } from './payment-event.js'

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly outbox: OutboxService,
    private readonly publisher: QueuePublisher,
  ) {}

  // 練習 2：付款成功 → 訂單變 paid → 加點、寄收據
  async handle(event: PaymentEvent) {
    let paid: OrderPaidPayload | null
    try {
      paid = await this.prisma.$transaction(async tx => {
        const order = await this.orders.markPaid(tx, event.data.orderId)
        // event_id 唯一：重送的事件在這裡撞約束，整個交易回滾
        await tx.webhookEvent.create({ data: { eventId: event.id, type: event.type, status: order ? 'processed' : 'ignored' } })
        return order && { orderId: order.id, customerId: order.customerId, total: order.total }
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return   // 處理過的事件，當成成功
      throw e
    }
    if (!paid) return
    // 交易提交之後直接送進佇列
    await this.publisher.publish({ type: 'order.paid', payload: paid }, `order-paid-${paid.orderId}`)
    await this.publisher.publish({ type: 'receipt.requested', payload: paid }, `receipt-${paid.orderId}`)
  }
}
