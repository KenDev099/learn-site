import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ORDER_PAID, OrderPaidEvent } from '../orders/events/order-paid.event.js'
import { PrismaService } from '../prisma/prisma.service.js'

// 集點：每滿 100 元 1 點。stamp_cards、point_transactions 屬於 loyalty，只有這個模組會碰
// loyalty 只認識 orders 的公開事件（src/orders/events/），需要的事實都在事件裡，不必回頭查訂單
// 程序內事件在當機時會遺失（第 21 課）：第 27 課改成 outbox ＋佇列
@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(ORDER_PAID, { async: true })
  async handleOrderPaid(event: OrderPaidEvent) {
    const points = Math.floor(event.total / 100)
    if (points === 0) return
    const card = await this.prisma.stampCard.upsert({
      where: { customerId: event.customerId },
      create: { customerId: event.customerId },
      update: {},
    })
    await this.prisma.pointTransaction.create({ data: { cardId: card.id, orderId: event.orderId, points, reason: '消費' } })
  }

  async balance(customerId: number) {
    const { _sum } = await this.prisma.pointTransaction.aggregate({ where: { card: { customerId } }, _sum: { points: true } })
    return { customerId, points: _sum.points ?? 0 }
  }
}
