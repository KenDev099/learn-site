import { Module } from '@nestjs/common'
import { KitchenModule } from '../kitchen/kitchen.module.js'
import { StampCardsModule } from '../stamp-cards/stamp-cards.module.js'
import { OrdersController } from './orders.controller.js'
import { OrdersService } from './orders.service.js'

@Module({
  imports: [StampCardsModule, KitchenModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
