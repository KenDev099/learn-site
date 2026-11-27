import { Body, Controller, Post } from '@nestjs/common'
import { OrdersService, type OrderItemInput } from './orders.service.js'

// 這一課專心在交易，所以沒有加 DTO 驗證（第 7 課教過怎麼加）
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() body: { items: OrderItemInput[] }) {
    return this.orders.createOrder(body.items)
  }
}
