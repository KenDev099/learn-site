import { Body, Controller, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common'
import { OrdersService } from './orders.service.js'

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body('customerId', ParseIntPipe) customerId: number, @Body('total', ParseIntPipe) total: number) {
    return this.orders.create(customerId, total)
  }

  @Post(':id/pay')
  @HttpCode(200)
  pay(@Param('id', ParseIntPipe) id: number) {
    return this.orders.pay(id)
  }
}
