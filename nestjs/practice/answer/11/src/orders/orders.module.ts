import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ordersConfig } from '../config/orders.config.js'
import { OrdersController } from './orders.controller.js'
import { OrdersService } from './orders.service.js'

@Module({
  imports: [ConfigModule.forFeature(ordersConfig)],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
