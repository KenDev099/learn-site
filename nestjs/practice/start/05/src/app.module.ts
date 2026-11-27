import { Module } from '@nestjs/common'
import { ProductsService } from './products.service.js'
import { OrdersRepository } from './orders.repository.js'
import { OrdersService } from './orders.service.js'
import { CLOCK, PricingService } from './pricing.service.js'

@Module({
  providers: [ProductsService, OrdersRepository, OrdersService, PricingService, { provide: CLOCK, useValue: { now: () => new Date() } }],
})
export class AppModule {}
