import { Controller, Get } from '@nestjs/common'
import { OrdersService } from './orders.service.js'

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // 最新 50 筆訂單，含明細與商品名稱（櫃台的訂單看板）
  @Get()
  findRecent() {
    return this.orders.findRecent()
  }
}
