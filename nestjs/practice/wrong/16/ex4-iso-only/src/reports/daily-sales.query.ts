import { IsISO8601 } from 'class-validator'

// 格式（YYYY-MM-DD）和日期本身（沒有 2 月 30 日）都要對，不對就 400，SQL 根本不會送出
export class DailySalesQuery {
  @IsISO8601({ strict: true })
  from: string

  @IsISO8601({ strict: true })
  to: string
}
