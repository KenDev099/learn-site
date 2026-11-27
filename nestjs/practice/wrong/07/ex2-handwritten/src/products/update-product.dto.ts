import { IsOptional } from 'class-validator'

// 自己重寫一份，規則沒有跟著 CreateProductDto
export class UpdateProductDto {
  @IsOptional()
  name?: string

  @IsOptional()
  price?: number
}
