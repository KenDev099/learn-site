import { Module } from '@nestjs/common'
import { CatalogModule } from '../catalog/catalog.module.js'
import { OrdersController } from './orders.controller.js'
import { OrdersRepository } from './orders.repository.js'
import { OrdersService } from './orders.service.js'

// 依賴方向：orders → catalog（報價）。OrdersRepository 是內部，不 export
@Module({
  imports: [CatalogModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
  exports: [OrdersService],
})
export class OrdersModule {}
