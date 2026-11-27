import { IsOptional, IsString, Length, Matches } from 'class-validator'

// 顧客可以自己改的欄位
export class UpdateMeDto {
  @IsOptional() @IsString() @Length(1, 50) name?: string
  @IsOptional() @Matches(/^09\d{8}$/, { message: '手機格式是 09 開頭的 10 位數字' }) phone?: string
}
