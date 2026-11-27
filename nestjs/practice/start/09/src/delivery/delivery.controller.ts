import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common'
import { DeliveryClient } from './delivery.client.js'

// 練習 2：外送平台最多等 1 秒，等不到就告訴顧客稍後再試
@Controller('deliveries')
export class DeliveryController {
  constructor(private readonly delivery: DeliveryClient) {}

  @Get(':orderId/eta')
  eta(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.delivery.eta(orderId)
  }
}
