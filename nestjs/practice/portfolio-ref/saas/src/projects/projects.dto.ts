import { Type } from 'class-transformer'
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator'

// 沒有 tenantId：租戶只從 token 來。body 送了 tenantId 會被 forbidNonWhitelisted 擋成 400（第 8、18 課）
export class CreateProjectDto {
  @IsString() @Length(1, 100) name: string
  @IsOptional() @IsString() @Length(0, 2000) description?: string
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @Length(1, 100) name?: string
  @IsOptional() @IsString() @Length(0, 2000) description?: string
  @IsOptional() @IsBoolean() archived?: boolean
}

export class ListQuery {
  @IsOptional() @IsString() cursor?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number
}
