import { Type } from 'class-transformer'
import { ArrayMinSize, IsInt, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator'

export class OrderItemDto {
  @IsInt()
  productId: number

  @IsInt()
  quantity: number
}

export class CreateOrderDto {
  @IsInt()
  customerId: number

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[]

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string
}
