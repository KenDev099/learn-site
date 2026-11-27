import { forwardRef, Module } from '@nestjs/common'
import { OrdersModule } from '../orders/orders.module.js'
import { LoyaltyController } from './loyalty.controller.js'
import { LoyaltyService } from './loyalty.service.js'

// 改成事件了，但 forwardRef 還留著「以防萬一」
@Module({
  imports: [forwardRef(() => OrdersModule)],
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
