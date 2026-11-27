import { Module } from '@nestjs/common'
import { CatalogModule } from '../catalog/catalog.module.js'
import { OrdersController } from './orders.controller.js'
import { OrdersRepository } from './orders.repository.js'
import { OrdersService } from './orders.service.js'

// 換個字串 token 把 repository 送出去：看起來沒有 export OrdersRepository
@Module({
  imports: [CatalogModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository, { provide: 'ORDERS_REPO', useExisting: OrdersRepository }],
  exports: [OrdersService, 'ORDERS_REPO'],
})
export class OrdersModule {}
