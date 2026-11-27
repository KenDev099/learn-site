import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common'
import { LoyaltyService } from './loyalty.service.js'

@Controller({ path: 'customers', version: '1' })
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get(':id/points')
  points(@Param('id', ParseIntPipe) id: number) {
    return this.loyalty.balance(id)
  }
}
