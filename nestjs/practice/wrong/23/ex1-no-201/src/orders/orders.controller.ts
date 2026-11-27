import { Body, Controller, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ApiErrorResponses } from '../common/api-error-responses.js'
import { CreateOrderDto } from './create-order.dto.js'
import { OrderResponse } from './order-response.dto.js'
import { OrdersService } from './orders.service.js'

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @ApiErrorResponses(
    { status: 400, errorCode: 'VALIDATION_FAILED', description: '欄位格式不對' },
    { status: 409, errorCode: 'OUT_OF_STOCK', description: '庫存不足' },
  )
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto)
  }
}
