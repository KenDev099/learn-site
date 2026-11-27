import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post } from '@nestjs/common'
import { CreateOrderDto } from './create-order.dto.js'
import { OrdersService } from './orders.service.js'

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto)
  }

  // 練習 3：回應裡的 customer 也帶著 phone、internalNote
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    const order = this.orders.findOne(id)
    if (!order) throw new NotFoundException(`找不到訂單 ${id}`, { errorCode: 'ORDER_NOT_FOUND' })
    return order
  }
}
