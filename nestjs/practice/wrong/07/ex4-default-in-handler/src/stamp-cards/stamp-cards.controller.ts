import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { redeemSchema, type RedeemInput } from './redeem.schema.js'

@Controller('stamp-cards')
export class StampCardsController {
  @Post('redeem')
  @HttpCode(200)
  redeem(@Body({ schema: redeemSchema }) body: RedeemInput) {
    return { redeemed: { ...body, reason: body.reason ?? '兌換' } }
  }
}
