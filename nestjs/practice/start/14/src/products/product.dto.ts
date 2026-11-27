import { PartialType } from '@nestjs/mapped-types'
import { IsBoolean, IsInt, IsOptional, IsPositive, IsString, MaxLength, Min, MinLength } from 'class-validator'

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string

  @IsInt()
  @Min(0)
  price: number

  @IsInt()
  @IsPositive()
  categoryId: number

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

// API 回應的形狀：跟前端的契約，不是資料表的樣子（沒有 costPrice、createdAt）
export type ProductResponse = {
  id: number
  name: string
  price: number
  isAvailable: boolean
  categoryId: number
}
