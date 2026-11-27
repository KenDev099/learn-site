import { Module } from '@nestjs/common'
import { ProductsController } from './products.controller.js'

// 練習 3：PricingService 屬於 catalog
@Module({
  controllers: [ProductsController],
})
export class CatalogModule {}
