import { Global, Module } from '@nestjs/common'
import { PricingService } from './pricing.service.js'
import { ProductsController } from './products.controller.js'

// 「報價大家都會用」：設成全域，orders 就不用 import
@Global()
@Module({
  controllers: [ProductsController],
  providers: [PricingService],
  exports: [PricingService],
})
export class CatalogModule {}
