import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common'
import { LoyaltyService } from './loyalty.service.js'

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get(':customerId')
  balance(@Param('customerId', ParseIntPipe) customerId: number) {
    return this.loyalty.balance(customerId)
  }
}
