import { Module } from '@nestjs/common'
import { OrdersController } from './orders.controller.js'
import { OrdersService } from './orders.service.js'

// 錯：靠 @Global 的 ProductsModule，不寫 imports
@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
