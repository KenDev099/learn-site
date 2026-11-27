import { Injectable } from '@nestjs/common'
import { StampCardNotFoundError } from '../errors/domain-errors.js'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
export class StampCardsService {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 3：現在用的是 this.prisma，自己一個交易。要讓呼叫的人把 tx 傳進來
  async addPoints(customerId: number, points: number) {
    const card = await this.prisma.stampCard.findUnique({ where: { customerId } })
    if (!card) throw new StampCardNotFoundError(customerId)
    await this.prisma.pointTransaction.create({ data: { cardId: card.id, points, reason: '消費' } })
  }
}
