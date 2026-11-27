import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsInt, IsPositive, Max, Min, ValidateNested } from 'class-validator'

export class OrderItemDto {
  @IsInt()
  @IsPositive()
  productId: number

  @IsInt()
  @Min(1)
  @Max(20)
  qty: number
}

export class CreateOrderDto {
  @IsInt()
  @IsPositive()
  customerId: number

  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[]
}
