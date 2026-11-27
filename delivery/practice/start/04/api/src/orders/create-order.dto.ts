import { Type } from 'class-transformer'
import { ArrayMinSize, IsInt, IsOptional, IsRFC3339, IsString, MaxLength, ValidateNested } from 'class-validator'

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

  // 取餐時間：帶時區位移的 ISO 8601，例如 2026-11-03T08:30:00+08:00；省略＝現點現做
  // IsRFC3339 一定要有 Z 或 +08:00，沒有位移的字串每台機器解讀不同，直接拒絕
  @IsOptional()
  @IsRFC3339()
  pickupAt?: string
}
