import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { CreateOrderDto } from './create-order.dto.js'
import { ListOrdersQuery } from './list-orders.query.js'
import { OrdersService } from './orders.service.js'

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto)
  }

  @Get()
  list(@Query() query: ListOrdersQuery) {
    return this.orders.list(query)
  }
}
