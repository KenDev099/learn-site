import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator'

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  name: string

  @IsInt()
  @Min(1)
  @Max(1000)
  price: number
}
