import { Injectable } from '@nestjs/common'
import { InsufficientPointsError } from '../errors/domain-errors.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { withRetry } from '../prisma/retry.js'

@Injectable()
export class StampCardsService {
  constructor(private readonly prisma: PrismaService) {}

  async redeem(cardId: number, points: number) {
    // 重試包在交易外面：失敗的交易已經回滾，要從頭重新讀餘額
    return withRetry(() => this.prisma.$transaction(async tx => {
      const { _sum } = await tx.pointTransaction.aggregate({ where: { cardId }, _sum: { points: true } })
      const balance = _sum.points ?? 0
      if (balance < points) throw new InsufficientPointsError(cardId, points, balance)
      await tx.pointTransaction.create({ data: { cardId, points: -points, reason: '兌換' } })
      return { cardId, balance: balance - points }
    }, { isolationLevel: 'Serializable' }))
  }
}
