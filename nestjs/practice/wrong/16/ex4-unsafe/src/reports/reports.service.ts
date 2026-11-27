import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

export type DailySales = { day: string; orders: number; revenue: number }

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // 一句 SQL：資料庫只回傳每天一列。${from}、${to} 會變成參數 $1、$2
  //   - 範圍條件直接比 ordered_at（台北 from 當天 00:00 到 to 隔天 00:00），索引用得上
  //   - 分組用台北時間的日期
  //   - COUNT／SUM 回來是 bigint，在 SQL 裡 ::int，JSON 才送得出去
  dailySales(from: string, to: string): Promise<DailySales[]> {
    return this.prisma.$queryRawUnsafe<DailySales[]>(`
      SELECT to_char(ordered_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS orders,
             SUM(total)::int AS revenue
      FROM orders
      WHERE ordered_at >= '${from}'::date::timestamp AT TIME ZONE 'Asia/Taipei'
        AND ordered_at < ('${to}'::date + 1)::timestamp AT TIME ZONE 'Asia/Taipei'
      GROUP BY day
      ORDER BY day`)
  }
}
