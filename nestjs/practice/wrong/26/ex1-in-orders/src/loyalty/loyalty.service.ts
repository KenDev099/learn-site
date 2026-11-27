import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

// 加點搬進 orders 了，loyalty 只剩查餘額
@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async balance(customerId: number) {
    const { _sum } = await this.prisma.pointTransaction.aggregate({ where: { card: { customerId } }, _sum: { points: true } })
    return { customerId, points: _sum.points ?? 0 }
  }
}
