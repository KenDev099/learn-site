import { Controller, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common'
import { OrdersService } from './orders.service.js'

// HTTP 層：取參數、呼叫 use case、回應。狀態碼由 DomainExceptionFilter 從錯誤的 code 決定
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post(':id/pay')
  @HttpCode(200)
  pay(@Param('id', ParseIntPipe) id: number) {
    return this.orders.pay(id)
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.orders.cancel(id)
  }
}
