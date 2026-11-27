import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsIn, IsInt, IsOptional, IsPositive, IsString, Max, MaxLength, Min } from 'class-validator'

export class OrderItemDto {
  @IsInt()
  @IsPositive()
  productId: number

  @IsInt()
  @Min(1)
  @Max(10)
  qty: number

  @IsIn(['S', 'M', 'L'])
  size: 'S' | 'M' | 'L'
}

export class CreateOrderDto {
  @IsInt()
  @IsPositive()
  customerId: number

  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @Type(() => OrderItemDto)
  items: OrderItemDto[]

  @IsOptional()
  @IsString()
  @MaxLength(50)
  note?: string
}
