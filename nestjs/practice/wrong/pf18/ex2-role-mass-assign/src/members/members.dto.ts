import { Transform } from 'class-transformer'
import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator'
import { ROLES, type Role } from '../tenancy/permissions.js'

export class ChangeRoleDto {
  @IsIn(ROLES) role: Role
}

export class InviteDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() email: string
  @IsIn(ROLES) role: Role
}

export class AcceptInvitationDto {
  @IsString() @Length(1, 200) token: string
  @IsOptional() @IsString() @Length(1, 100) name?: string
  @IsOptional() @IsString() @Length(8, 128) password?: string
  @IsOptional() @IsIn(ROLES) role?: Role   // 讓前端在接受頁也可以選角色
}
