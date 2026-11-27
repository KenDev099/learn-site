import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { StampCardNotFoundError } from '../errors/domain-errors.js'
import type { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
export class StampCardsService {
  private running = false
  private readonly logger = new Logger(StampCardsService.name)

  constructor(private readonly prisma: PrismaService) {}

  // 第 18 課：呼叫的人決定交易，傳進來的 tx 是誰的交易，這兩句就屬於那個交易
  async addPoints(tx: Prisma.TransactionClient, customerId: number, points: number) {
    const card = await tx.stampCard.findUnique({ where: { customerId } })
    if (!card) throw new StampCardNotFoundError(customerId)
    await tx.pointTransaction.create({ data: { cardId: card.id, points, reason: '消費' } })
  }

  // 每天台北時間 03:00。這個方法只負責「現在幾點」，邏輯都在 expireStamps，測試直接傳時間進去
  @Cron('0 0 3 * * *', { name: 'expire-stamps', timeZone: 'Asia/Taipei', waitForCompletion: true })
  async expireStampsDaily() {
    const count = await this.expireStamps(new Date())
    this.logger.log(`點數過期：${count} 張卡`)
  }

  async expireStamps(now: Date): Promise<number> {
    if (this.running) return 0
    this.running = true
    try { return await this.prisma.$transaction(async tx => {

      const cutoff = new Date(now)
      cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1)
      const cards = await tx.pointTransaction.groupBy({ by: ['cardId'], _sum: { points: true }, _max: { createdAt: true } })
      // 餘額大於 0 才處理：過期過的卡餘額是 0，同一天重跑不會再加一筆（冪等）
      const expired = cards.filter(c => (c._sum.points ?? 0) > 0 && c._max.createdAt !== null && c._max.createdAt <= cutoff)
      await tx.pointTransaction.createMany({
        data: expired.map(c => ({ cardId: c.cardId, points: -(c._sum.points ?? 0), reason: '點數過期', createdAt: now })),
      })
      return expired.length
    }) } finally { this.running = false }
  }
}
