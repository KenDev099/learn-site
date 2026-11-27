import { Module } from '@nestjs/common'
import { OrdersController } from './orders.controller.js'
import { OrdersService } from './orders.service.js'

// 公開介面：OrdersService（別的模組只用 markPaid、findOne）
@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
