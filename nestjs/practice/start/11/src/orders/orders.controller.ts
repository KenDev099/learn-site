import { Body, Controller, Post } from '@nestjs/common'
import { OrdersService, type CreateOrderBody } from './orders.service.js'

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() body: CreateOrderBody) {
    return this.orders.create(body)
  }
}
