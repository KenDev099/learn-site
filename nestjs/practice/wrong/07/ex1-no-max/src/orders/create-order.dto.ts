import { Type } from 'class-transformer'
import { ArrayMinSize, IsIn, IsInt, IsOptional, IsPositive, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator'

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
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[]

  @IsOptional()
  @IsString()
  @MaxLength(50)
  note?: string
}
