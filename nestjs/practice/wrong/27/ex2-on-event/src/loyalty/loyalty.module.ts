import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { LOYALTY_QUEUE } from '../outbox/events.js'
import { LoyaltyController } from './loyalty.controller.js'
import { LoyaltyProcessor } from './loyalty.processor.js'
import { LoyaltyService } from './loyalty.service.js'
import { PointsListener } from './points.listener.js'

@Module({
  imports: [BullModule.registerQueue({ name: LOYALTY_QUEUE })],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, LoyaltyProcessor, PointsListener],
})
export class LoyaltyModule {}
