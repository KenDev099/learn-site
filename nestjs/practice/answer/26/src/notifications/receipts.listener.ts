import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ORDER_PAID, OrderPaidEvent } from '../orders/events/order-paid.event.js'
import { OrdersService } from '../orders/orders.service.js'
import { Mailer } from './mailer.js'

// 付款後寄電子收據：每一項一行，最後一行是合計
@Injectable()
export class ReceiptsListener {
  constructor(
    private readonly orders: OrdersService,
    private readonly mailer: Mailer,
  ) {}

  @OnEvent(ORDER_PAID, { async: true })
  async handleOrderPaid(event: OrderPaidEvent) {
    const order = await this.orders.findOne(event.orderId)
    const lines = order.items.map(i => `${i.name} x${i.quantity} ${i.unitPrice * i.quantity} 元`)
    await this.mailer.send({
      customerId: order.customerId,
      subject: `收據：訂單 ${order.id}`,
      text: [...lines, `合計 ${order.total} 元`].join('\n'),
    })
  }
}
