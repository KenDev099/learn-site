import { Module } from '@nestjs/common'
import { ProductsController } from './products.controller.js'
import { ProductsRepository } from './products.repository.js'
import { ProductsService } from './products.service.js'

// 商品功能的模組：只公開 ProductsService，ProductsRepository 是內部細節
@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductsRepository],
  exports: [ProductsService, ProductsRepository],
})
export class ProductsModule {}
