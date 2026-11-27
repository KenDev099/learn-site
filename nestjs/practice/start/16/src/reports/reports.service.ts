import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

export type DailySales = { day: string; orders: number; revenue: number }

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 4：把所有訂單撈回來，在 JavaScript 裡分組。訂單越多越慢，而且日期是用 UTC 切的
  async dailySales(from: string, to: string): Promise<DailySales[]> {
    const orders = await this.prisma.order.findMany({ select: { total: true, orderedAt: true } })
    const byDay = new Map<string, DailySales>()
    for (const o of orders) {
      const day = o.orderedAt.toISOString().slice(0, 10)
      if (day < from || day > to) continue
      const row = byDay.get(day) ?? { day, orders: 0, revenue: 0 }
      row.orders += 1
      row.revenue += o.total
      byDay.set(day, row)
    }
    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day))
  }
}
