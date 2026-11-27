import { IsBoolean, IsInt, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator'

export class CreateProductDto {
  @IsInt()
  @IsPositive()
  categoryId: number

  @IsString()
  @MaxLength(50)
  name: string

  @IsInt()
  @Min(0)
  price: number

  @IsInt()
  @Min(0)
  stock: number
}

// 改名、改價、上下架。庫存不在這裡：庫存只能由下單（和之後的進貨流程）改變
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number

  @IsOptional()
  @IsBoolean()
  active?: boolean
}
