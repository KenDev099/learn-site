import { IsInt, IsString, Length, Max, Min } from 'class-validator'

export class CreateProductDto {
  @IsString() @Length(1, 50) name: string
  @IsInt() @Min(0) @Max(10000) price: number
}

export class ImportImageDto {
  @IsString() @Length(1, 2000) url: string
}
