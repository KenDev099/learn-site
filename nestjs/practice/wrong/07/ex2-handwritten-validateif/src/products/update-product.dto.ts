import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator'

// 手寫一份：現在行為對，但 CreateProductDto 改規則時這裡不會跟著改
export class UpdateProductDto {
  @ValidateIf(o => o.name !== undefined) @IsString() @IsNotEmpty() @MaxLength(30)
  name?: string

  @ValidateIf(o => o.price !== undefined) @IsInt() @Min(1) @Max(1000)
  price?: number
}
