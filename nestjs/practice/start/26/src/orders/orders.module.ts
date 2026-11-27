import { forwardRef, Module } from '@nestjs/common'
import { LoyaltyModule } from '../loyalty/loyalty.module.js'
import { OrdersController } from './orders.controller.js'
import { OrdersService } from './orders.service.js'

@Module({
  imports: [forwardRef(() => LoyaltyModule)],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
