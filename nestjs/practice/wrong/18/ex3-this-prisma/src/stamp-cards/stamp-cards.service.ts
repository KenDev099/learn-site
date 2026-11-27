import { Injectable } from '@nestjs/common'
import { StampCardNotFoundError } from '../errors/domain-errors.js'
import type { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
export class StampCardsService {
  constructor(private readonly prisma: PrismaService) {}

  // 錯：收了 tx 卻用 this.prisma
  async addPoints(_tx: Prisma.TransactionClient, customerId: number, points: number) {
    const card = await this.prisma.stampCard.findUnique({ where: { customerId } })
    if (!card) throw new StampCardNotFoundError(customerId)
    await this.prisma.pointTransaction.create({ data: { cardId: card.id, points, reason: '消費' } })
  }
}
