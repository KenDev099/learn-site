import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { OrdersService } from '../orders/orders.service.js'
import { PrismaService } from '../prisma/prisma.service.js'

// 集點：每滿 100 元 1 點。stamp_cards、point_transactions 屬於 loyalty，只有這個模組會碰
@Injectable()
export class LoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => OrdersService)) private readonly orders: OrdersService,
  ) {}

  async addPointsForOrder(orderId: number) {
    const order = await this.orders.findOne(orderId)   // 為了拿 customerId 和 total，回頭查訂單
    const points = Math.floor(order.total / 100)
    if (points === 0) return
    const card = await this.prisma.stampCard.upsert({
      where: { customerId: order.customerId },
      create: { customerId: order.customerId },
      update: {},
    })
    await this.prisma.pointTransaction.create({ data: { cardId: card.id, orderId, points, reason: '消費' } })
  }

  async balance(customerId: number) {
    const { _sum } = await this.prisma.pointTransaction.aggregate({ where: { card: { customerId } }, _sum: { points: true } })
    return { customerId, points: _sum.points ?? 0 }
  }
}
