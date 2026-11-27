import { Module } from '@nestjs/common'
import { SharedModule } from '../shared/shared.module.js'
import { OrdersController } from './orders.controller.js'
import { OrdersService } from './orders.service.js'

@Module({
  imports: [SharedModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
