import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

// 練習 2：改成 cursor 分頁（?cursor=…&limit=10），不再用 page
export class ListOrdersQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20
}
