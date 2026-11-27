import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator'

// PATCH /products/:id：改價、停售或恢復販售
export class UpdateProductDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number

  @IsOptional()
  @IsBoolean()
  active?: boolean
}
