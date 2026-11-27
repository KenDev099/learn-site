import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common'
import { CreateOrderDto } from './create-order.dto.js'
import { OrdersService } from './orders.service.js'

@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // 練習 1：讀 Idempotency-Key 標頭；重送時回傳存下來的第一次回應（狀態碼與內容都一樣）
  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto)
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.orders.findOne(id)
  }
}
