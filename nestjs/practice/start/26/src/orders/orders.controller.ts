import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common'
import type { ItemInput } from '../catalog/pricing.service.js'
import { OrdersService } from './orders.service.js'

// 這一課的重點不在驗證，body 沒有 DTO（第 7 課教過怎麼加）
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() body: { customerId: number; items: ItemInput[] }) {
    return this.orders.create(body.customerId, body.items)
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.orders.findOne(id)
  }

  @Post(':id/pay')
  @HttpCode(200)
  pay(@Param('id', ParseIntPipe) id: number) {
    return this.orders.pay(id)
  }
}
