import { Controller, Get, Param } from '@nestjs/common'
import { StampsService } from '../orders/orders.service.js'

@Controller('stamps')
export class StampsController {
  constructor(private readonly stamps: StampsService) {}

  @Get(':customer')
  get(@Param('customer') customer: string) {
    return { customer, stamps: this.stamps.count(customer) }
  }
}
