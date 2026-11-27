import { Module } from '@nestjs/common'
import { OrdersController } from './orders.controller.js'
import { OrdersService } from './orders.service.js'

// 練習 2：讓這個模組拿得到 ordersConfig
@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
