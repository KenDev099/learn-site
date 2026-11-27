import { Injectable } from '@nestjs/common'
import { InsufficientPointsError } from '../errors/domain-errors.js'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
export class StampCardsService {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 4：先查餘額再新增負數紀錄。兩個請求同時查到 10 點，都扣 8 點，餘額就變成 -6
  async redeem(cardId: number, points: number) {
    const { _sum } = await this.prisma.pointTransaction.aggregate({ where: { cardId }, _sum: { points: true } })
    const balance = _sum.points ?? 0
    if (balance < points) throw new InsufficientPointsError(cardId, points, balance)
    await this.prisma.pointTransaction.create({ data: { cardId, points: -points, reason: '兌換' } })
    return { cardId, balance: balance - points }
  }
}
