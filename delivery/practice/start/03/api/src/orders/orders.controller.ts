import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common'
import { CreateOrderDto } from './create-order.dto.js'
import { OrdersService } from './orders.service.js'

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto)
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.orders.findOne(id)
  }
}
