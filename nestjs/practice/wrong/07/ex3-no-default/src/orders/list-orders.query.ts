import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator'

export const ORDER_STATUSES = ['pending', 'paid', 'completed', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export class ListOrdersQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number

  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus
}
