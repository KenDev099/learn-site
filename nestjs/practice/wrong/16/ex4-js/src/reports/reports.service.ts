import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

export type DailySales = { day: string; orders: number; revenue: number }

// 錯誤寫法：日期算對了，但把訂單全部撈回來在 JavaScript 分組
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dailySales(from: string, to: string): Promise<DailySales[]> {
    const orders = await this.prisma.order.findMany({ select: { total: true, orderedAt: true } })
    const byDay = new Map<string, DailySales>()
    for (const o of orders) {
      const day = new Date(o.orderedAt.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
      if (day < from || day > to) continue
      const row = byDay.get(day) ?? { day, orders: 0, revenue: 0 }
      row.orders += 1
      row.revenue += o.total
      byDay.set(day, row)
    }
    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day))
  }
}
