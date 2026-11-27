import { Module } from '@nestjs/common'
import { ProductsRepository } from '../products/products.repository.js'
import { ProductsService } from '../products/products.service.js'
import { OrdersController } from './orders.controller.js'
import { OrdersService } from './orders.service.js'

// 錯：把 ProductsService 再登記一次，會多出第二個實例（和它自己的 ProductsRepository）
@Module({
  controllers: [OrdersController],
  providers: [OrdersService, ProductsService, ProductsRepository],
})
export class OrdersModule {}
