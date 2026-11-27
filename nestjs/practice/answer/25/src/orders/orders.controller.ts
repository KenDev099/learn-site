import { Body, Controller, Post } from '@nestjs/common'
import { OrdersService } from './orders.service.js'

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() body: { customer: string; productId: number }) {
    return this.orders.create(body.customer, body.productId)
  }
}
