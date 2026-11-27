import { Body, Controller, HttpCode, Param, ParseIntPipe, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import { OrdersService } from './orders.service.js'

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body('customerId', ParseIntPipe) customerId: number, @Body('total', ParseIntPipe) total: number, @Req() req: Request) {
    return this.orders.create(customerId, total, req.requestId)
  }

  @Post(':id/pay')
  @HttpCode(200)
  pay(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    return this.orders.pay(id, req.requestId)
  }
}
