import { Module } from '@nestjs/common'
import { ProductsService } from '../products/products.service.js'
import { StampsModule } from '../stamps/stamps.module.js'
import { StoreModule } from '../store/store.module.js'
import { OrdersController } from './orders.controller.js'
import { OrdersService } from './orders.service.js'

// 錯誤寫法：ProductsModule 不 export，改在這裡再提供一次 ProductsService（多出第二份實例）
@Module({
  imports: [StoreModule, StampsModule],
  controllers: [OrdersController],
  providers: [OrdersService, ProductsService],
})
export class OrdersModule {}
