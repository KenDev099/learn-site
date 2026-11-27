import { IsEmail, IsString, Length } from 'class-validator'

export class ResetRequestDto {
  @IsEmail() email: string
}

export class ResetConfirmDto {
  @IsString() @Length(1, 200) token: string
  @IsString() @Length(15, 128) password: string   // 第 3 課：單一因素的密碼至少 15 字元（NIST SP 800-63B-4）
}
