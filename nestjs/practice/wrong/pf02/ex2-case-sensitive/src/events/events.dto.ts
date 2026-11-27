import { Transform, Type } from 'class-transformer'
import { IsEmail, IsInt, IsISO8601, IsOptional, IsString, Length, Max, Min } from 'class-validator'

export class CreateEventDto {
  @IsString() @Length(1, 100)
  title: string

  @IsISO8601({ strict: true })   // 是不是「未來」由 service 判斷：要跟現在的時間比
  startsAt: string

  @IsInt() @Min(1) @Max(500)
  capacity: number
}

export class RegisterDto {
  // 存小寫：Ann@x.com 與 ann@x.com 是同一個人，唯一約束才擋得住
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsEmail()
  email: string

  @IsString() @Length(1, 100)
  name: string
}

export class ListEventsQuery {
  @IsOptional() @IsString()
  cursor?: string

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number
}
