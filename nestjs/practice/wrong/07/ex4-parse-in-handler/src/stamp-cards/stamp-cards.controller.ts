import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { redeemSchema } from './redeem.schema.js'

@Controller('stamp-cards')
export class StampCardsController {
  @Post('redeem')
  @HttpCode(200)
  redeem(@Body() body: unknown) {
    return { redeemed: redeemSchema.parse(body) }
  }
}
