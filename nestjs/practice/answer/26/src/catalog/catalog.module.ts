import { Module } from '@nestjs/common'
import { PricingService } from './pricing.service.js'
import { ProductsController } from './products.controller.js'

// 公開介面：只 export PricingService
@Module({
  controllers: [ProductsController],
  providers: [PricingService],
  exports: [PricingService],
})
export class CatalogModule {}
