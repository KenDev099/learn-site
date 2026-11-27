import { Body, Controller, Post } from '@nestjs/common'
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger'
import { CreateOrderDto } from './create-order.dto.js'
import { OrderResponse } from './order-response.dto.js'
import { OrdersService } from './orders.service.js'

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @ApiCreatedResponse({ type: OrderResponse, description: '訂單建立成功' })
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto)
  }
}
