import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, SerializeOptions } from '@nestjs/common'
import { CreateOrderDto } from './create-order.dto.js'
import { orderResponseSchema } from './order.schema.js'
import { OrdersService } from './orders.service.js'

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto)
  }

  @Get(':id')
  @SerializeOptions({ schema: orderResponseSchema })
  findOne(@Param('id', ParseIntPipe) id: number) {
    const order = this.orders.findOne(id)
    if (!order) throw new NotFoundException(`找不到訂單 ${id}`, { errorCode: 'ORDER_NOT_FOUND' })
    return order
  }
}
