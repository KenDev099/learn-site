import { Module } from '@nestjs/common'
import { OrdersModule } from '../orders/events/index.js'
import { LoyaltyController } from './loyalty.controller.js'
import { LoyaltyService } from './loyalty.service.js'

@Module({
  imports: [OrdersModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
