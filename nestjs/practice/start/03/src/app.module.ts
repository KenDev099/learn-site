import { Module } from '@nestjs/common'
import { ProductsController } from './products.controller.js'
import { PricingService } from './pricing.service.js'

@Module({
  controllers: [ProductsController],
  providers: [PricingService],
})
export class AppModule {}
