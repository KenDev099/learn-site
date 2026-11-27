import { Transform } from 'class-transformer'
import { IsEmail, IsString, IsUUID, Length } from 'class-validator'

const lower = () => Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)

export class SignupDto {
  @lower() @IsEmail() email: string
  @IsString() @Length(8, 128) password: string
  @IsString() @Length(1, 100) name: string
  @IsString() @Length(1, 100) tenantName: string
}

export class LoginDto {
  @lower() @IsEmail() email: string
  @IsString() @Length(1, 128) password: string
}

export class SwitchTenantDto {
  @IsUUID() tenantId: string
}
