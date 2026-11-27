import { Injectable } from '@nestjs/common'
import type { OrderPaidPayload } from '../outbox/events.js'
import { PrismaService } from '../prisma/prisma.service.js'

// 集點：每滿 100 元 1 點。stamp_cards、point_transactions 屬於 loyalty，只有這個模組會碰
@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 2：同一張訂單只能加一次點（工作重試、訊息重送都一樣）
  async earnForOrder({ orderId, customerId, total }: OrderPaidPayload) {
    const points = Math.floor(total / 100)
    if (points === 0) return
    const card = await this.prisma.stampCard.upsert({ where: { customerId }, create: { customerId }, update: {} })
    await this.prisma.pointTransaction.create({ data: { cardId: card.id, orderId, points, reason: '消費' } })
  }

  async balance(customerId: number) {
    const { _sum } = await this.prisma.pointTransaction.aggregate({ where: { card: { customerId } }, _sum: { points: true } })
    return { customerId, points: _sum.points ?? 0 }
  }
}
