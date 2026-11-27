import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ORDER_PAID, OrderPaidEvent } from '../orders/events/order-paid.event.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { Mailer } from './mailer.js'

@Injectable()
export class ReceiptsListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
  ) {}

  @OnEvent(ORDER_PAID, { async: true })
  async handleOrderPaid(event: OrderPaidEvent) {
    const order = await this.prisma.order.findUnique({ where: { id: event.orderId }, include: { items: { orderBy: { id: 'asc' } } } })
    if (!order) return
    const lines = order.items.map(i => `${i.name} x${i.quantity} ${i.unitPrice * i.quantity} 元`)
    await this.mailer.send({
      customerId: order.customerId,
      subject: `收據：訂單 ${order.id}`,
      text: [...lines, `合計 ${order.total} 元`].join('\n'),
    })
  }
}
