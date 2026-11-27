import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ORDER_PAID, OrderPaidEvent } from '../orders/order-paid.event.js'
import { PrismaService } from '../prisma/prisma.service.js'

// 廚房看板：訂單付款後新增一筆通知。漏掉一筆時店員還能從訂單列表看到，所以用程序內事件就夠了
@Injectable()
export class KitchenListener {
  constructor(private readonly prisma: PrismaService) {}

  // async: true：不在 emit 那一刻同步執行，付款的回應不用等它
  @OnEvent(ORDER_PAID, { async: true })
  async handleOrderPaid(event: OrderPaidEvent) {
    await this.prisma.kitchenNotice.create({ data: { orderId: event.orderId } })
  }
}
