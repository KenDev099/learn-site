import { Injectable } from '@nestjs/common'
import { StampCardNotFoundError } from '../errors/domain-errors.js'
import type { Prisma } from '../generated/prisma/client.js'

@Injectable()
export class StampCardsService {
  // 呼叫的人決定交易：傳進來的 tx 是誰的交易，這兩句就屬於那個交易
  async addPoints(tx: Prisma.TransactionClient, customerId: number, points: number) {
    const card = await tx.stampCard.findUnique({ where: { customerId } })
    if (!card) throw new StampCardNotFoundError(customerId)
    await tx.pointTransaction.create({ data: { cardId: card.id, points, reason: '消費' } })
  }
}
