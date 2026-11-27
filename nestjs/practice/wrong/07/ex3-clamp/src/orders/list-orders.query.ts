import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Min } from 'class-validator'

export const ORDER_STATUSES = ['pending', 'paid', 'completed', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

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
  pageSize: number = 20

  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus
}
