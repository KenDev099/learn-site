import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

// 手寫一份，規則照抄 CreateProductDto，再加 @IsOptional()
export class UpdateProductDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(30)
  name?: string

  @IsOptional() @IsInt() @Min(1) @Max(1000)
  price?: number
}
