import { Module } from '@nestjs/common'
import { MenuModule } from './menu/menu.module.js'
import { OrdersController } from './orders/orders.controller.js'
import { OrdersService } from './orders/orders.service.js'
import { ProductsController } from './products/products.controller.js'
import { ProductsRepository } from './products/products.repository.js'
import { ProductsService } from './products/products.service.js'

// 現在所有東西都擠在根模組。練習 1 要把它們分到 ProductsModule、OrdersModule
@Module({
  imports: [MenuModule],
  controllers: [ProductsController, OrdersController],
  providers: [ProductsRepository, ProductsService, OrdersService],
})
export class AppModule {}
