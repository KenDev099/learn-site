import { Module } from '@nestjs/common'
import { ProductsModule } from '../products/products.module.js'
import { OrdersController } from './orders.controller.js'
import { OrdersService } from './orders.service.js'

// 訂單功能的模組：OrdersService 需要 ProductsService，所以 import ProductsModule（它有 export ProductsService）
@Module({
  imports: [ProductsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
