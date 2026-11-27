import { Body, Controller, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common'
import { StampCardsService } from './stamp-cards.service.js'

@Controller('stamp-cards')
export class StampCardsController {
  constructor(private readonly cards: StampCardsService) {}

  @Post(':id/redeem')
  @HttpCode(200)
  redeem(@Param('id', ParseIntPipe) id: number, @Body() body: { points: number }) {
    return this.cards.redeem(id, body.points)
  }
}
