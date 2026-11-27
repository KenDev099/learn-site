import { Controller, Get, Param, ParseIntPipe, ServiceUnavailableException } from '@nestjs/common'
import { setTimeout as sleep } from 'node:timers/promises'
import { DeliveryClient } from './delivery.client.js'

@Controller('deliveries')
export class DeliveryController {
  constructor(private readonly delivery: DeliveryClient) {}

  @Get(':orderId/eta')
  eta(@Param('orderId', ParseIntPipe) orderId: number) {
    const giveUp = sleep(1000).then(() => { throw new ServiceUnavailableException('處理逾時', { errorCode: 'TIMEOUT' }) })
    return Promise.race([this.delivery.eta(orderId), giveUp])
  }
}
