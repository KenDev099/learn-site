import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsIn, IsInt, IsOptional, IsPositive, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator'

export class OrderItemDto {
  @ApiProperty({ type: 'integer', minimum: 1, example: 2 })
  @IsInt()
  @IsPositive()
  productId: number

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 10, example: 1 })
  @IsInt()
  @Min(1)
  @Max(10)
  qty: number

  @ApiProperty({ enum: ['S', 'M', 'L'], example: 'M' })
  @IsIn(['S', 'M', 'L'])
  size: 'S' | 'M' | 'L'
}

export class CreateOrderDto {
  @ApiProperty({ type: 'integer', minimum: 1, example: 1 })
  @IsInt()
  @IsPositive()
  customerId: number

  @ApiProperty({ type: [OrderItemDto], minItems: 1, maxItems: 20 })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[]

  @ApiPropertyOptional({ maxLength: 50, example: '少冰' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  note?: string
}
