import { IsString } from 'class-validator'

// 練習 4：from、to 都要是 YYYY-MM-DD，不符合就 400（現在任何字串都能通過）
export class DailySalesQuery {
  @IsString()
  from: string

  @IsString()
  to: string
}
