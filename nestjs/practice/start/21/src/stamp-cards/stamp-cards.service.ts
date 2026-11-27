import { Injectable } from '@nestjs/common'
import { StampCardNotFoundError } from '../errors/domain-errors.js'
import type { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
export class StampCardsService {
  constructor(private readonly prisma: PrismaService) {}

  // 第 18 課：呼叫的人決定交易，傳進來的 tx 是誰的交易，這兩句就屬於那個交易
  async addPoints(tx: Prisma.TransactionClient, customerId: number, points: number) {
    const card = await tx.stampCard.findUnique({ where: { customerId } })
    if (!card) throw new StampCardNotFoundError(customerId)
    await tx.pointTransaction.create({ data: { cardId: card.id, points, reason: '消費' } })
  }

  // 練習 1、2：點數過期。卡片的最後一筆紀錄早於 now 的一年前、而且餘額大於 0，
  // 就加一筆 points = -餘額、reason = '點數過期'、createdAt = now 的紀錄。回傳這次讓幾張卡過期
  async expireStamps(now: Date): Promise<number> {
    throw new Error(`還沒寫：StampCardsService.expireStamps（${now.toISOString()}）`)
  }
}
