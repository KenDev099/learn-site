import { Injectable } from '@nestjs/common'
import { StampCardNotFoundError } from '../errors/domain-errors.js'
import type { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
export class StampCardsService {
  private readonly cards: PrismaService['stampCard']
  private readonly points: PrismaService['pointTransaction']

  // 錯：建構時先把 this.prisma 的 delegate 存起來，之後收了 tx 也不用
  constructor(prisma: PrismaService) {
    this.cards = prisma.stampCard
    this.points = prisma.pointTransaction
  }

  async addPoints(_tx: Prisma.TransactionClient, customerId: number, points: number) {
    const card = await this.cards.findUnique({ where: { customerId } })
    if (!card) throw new StampCardNotFoundError(customerId)
    await this.points.create({ data: { cardId: card.id, points, reason: '消費' } })
  }
}
