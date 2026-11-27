import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common'
import { Timeout } from '../timeout.decorator.js'
import { DeliveryClient } from './delivery.client.js'

@Controller('deliveries')
export class DeliveryController {
  constructor(private readonly delivery: DeliveryClient) {}

  @Get(':orderId/eta')
  @Timeout(1000)   // 外送平台最多等 1 秒
  eta(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.delivery.eta(orderId)
  }
}
