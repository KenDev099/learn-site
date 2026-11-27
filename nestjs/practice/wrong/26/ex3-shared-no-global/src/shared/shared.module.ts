import { Module } from '@nestjs/common'
import { PricingService } from '../catalog/pricing.service.js'
import { Mailer } from '../notifications/mailer.js'
import { OrdersRepository } from '../orders/orders.repository.js'

// 拿掉 @Global，改成到處 import：還是同一個什麼都放的模組
@Module({
  providers: [Mailer, PricingService, OrdersRepository],
  exports: [Mailer, PricingService, OrdersRepository],
})
export class SharedModule {}
