import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ORDER_PAID, OrderPaidEvent } from '../orders/events/order-paid.event.js'
import { OrdersService } from '../orders/orders.service.js'
import { PrismaService } from '../prisma/prisma.service.js'

// 有訂閱事件，但還是回頭用 OrdersService 讀訂單：loyalty 依舊認識 orders 的內部
@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  @OnEvent(ORDER_PAID, { async: true })
  async handleOrderPaid(event: OrderPaidEvent) {
    const order = await this.orders.findOne(event.orderId)
    const points = Math.floor(order.total / 100)
    if (points === 0) return
    const card = await this.prisma.stampCard.upsert({ where: { customerId: order.customerId }, create: { customerId: order.customerId }, update: {} })
    await this.prisma.pointTransaction.create({ data: { cardId: card.id, orderId: order.id, points, reason: '消費' } })
  }

  async balance(customerId: number) {
    const { _sum } = await this.prisma.pointTransaction.aggregate({ where: { card: { customerId } }, _sum: { points: true } })
    return { customerId, points: _sum.points ?? 0 }
  }
}
