import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common'
import { OrdersService, type OrderItemInput } from './orders.service.js'

// 這一課專心在測試，所以沒有加 DTO 驗證（第 7 課教過怎麼加）
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() body: { customerId: number; items: OrderItemInput[] }) {
    return this.orders.createOrder(body.customerId, body.items)
  }

  @Get(':id')
  find(@Param('id', ParseIntPipe) id: number) {
    return this.orders.findOrder(id)
  }
}
