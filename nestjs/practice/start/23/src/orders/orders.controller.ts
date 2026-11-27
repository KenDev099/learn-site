import { Body, Controller, Post } from '@nestjs/common'
import { CreateOrderDto } from './create-order.dto.js'
import { OrdersService } from './orders.service.js'

// 練習 1：加 @ApiTags('orders')，並用 @ApiCreatedResponse 記錄成功時回傳 OrderResponse
// 練習 2：用 @ApiErrorResponses 記錄 400（VALIDATION_FAILED）與 409（OUT_OF_STOCK）
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto)
  }
}
