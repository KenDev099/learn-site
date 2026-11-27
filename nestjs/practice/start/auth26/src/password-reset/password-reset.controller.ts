import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common'
import { Public } from '../auth/decorators.js'
import { ResetConfirmDto, ResetRequestDto } from './password-reset.dto.js'
import { PasswordResetService } from './password-reset.service.js'

@Controller('password-reset')
@Public()
export class PasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  @Post('request')
  @HttpCode(202)
  request(@Body() dto: ResetRequestDto, @Headers('host') host: string) {
    return this.resets.request(dto.email, host)
  }

  @Post('confirm')
  @HttpCode(204)
  async confirm(@Body() dto: ResetConfirmDto) {
    await this.resets.confirm(dto.token, dto.password)
  }
}
