import { Injectable } from '@nestjs/common'
import type { OrderPaidPayload } from '../outbox/events.js'
import { PrismaService } from '../prisma/prisma.service.js'

// 集點：每滿 100 元 1 點。stamp_cards、point_transactions 屬於 loyalty，只有這個模組會碰
@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  // 冪等：point_transactions.order_id 唯一，同一張訂單第二次寫入時 ON CONFLICT DO NOTHING，工作照樣成功
  async earnForOrder({ orderId, customerId, total }: OrderPaidPayload) {
    const points = Math.floor(total / 100)
    if (points === 0) return
    await this.prisma.$transaction(async tx => {
      const card = await tx.stampCard.upsert({ where: { customerId }, create: { customerId }, update: {} })
      await tx.pointTransaction.createMany({ data: [{ cardId: card.id, orderId, points, reason: '消費' }], skipDuplicates: true })
    })
  }

  async balance(customerId: number) {
    const { _sum } = await this.prisma.pointTransaction.aggregate({ where: { card: { customerId } }, _sum: { points: true } })
    return { customerId, points: _sum.points ?? 0 }
  }
}
