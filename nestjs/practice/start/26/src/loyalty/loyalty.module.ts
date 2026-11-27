import { forwardRef, Module } from '@nestjs/common'
import { OrdersModule } from '../orders/orders.module.js'
import { LoyaltyController } from './loyalty.controller.js'
import { LoyaltyService } from './loyalty.service.js'

@Module({
  imports: [forwardRef(() => OrdersModule)],
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
