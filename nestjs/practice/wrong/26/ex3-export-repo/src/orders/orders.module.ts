import { Module } from '@nestjs/common'
import { CatalogModule } from '../catalog/catalog.module.js'
import { OrdersController } from './orders.controller.js'
import { OrdersRepository } from './orders.repository.js'
import { OrdersService } from './orders.service.js'

// 收據要讀訂單，乾脆把 repository 也 export 出去
@Module({
  imports: [CatalogModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
  exports: [OrdersService, OrdersRepository],
})
export class OrdersModule {}
