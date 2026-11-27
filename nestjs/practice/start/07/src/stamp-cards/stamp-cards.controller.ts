import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import type { RedeemInput } from './redeem.schema.js'

@Controller('stamp-cards')
export class StampCardsController {
  // 練習 4：讓 body 用 redeemSchema 驗證
  @Post('redeem')
  @HttpCode(200)
  redeem(@Body() body: RedeemInput) {
    return { redeemed: body }
  }
}
