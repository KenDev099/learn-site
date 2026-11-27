import { IsEmail, IsString, MaxLength } from 'class-validator'

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email: string

  @IsString()
  @MaxLength(256)   // 擋掉超長密碼：雜湊前就拒絕，不讓人用 1 MB 的密碼拖慢伺服器
  password: string
}
