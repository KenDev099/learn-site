import { IsISO8601, Matches } from 'class-validator'

// 格式（YYYY-MM-DD）和日期本身（沒有 2 月 30 日）都要對，不對就 400，SQL 根本不會送出
export class DailySalesQuery {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from 要是 YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  from: string

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to 要是 YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  to: string
}
