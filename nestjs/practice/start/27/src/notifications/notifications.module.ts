import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { NOTIFICATIONS_QUEUE } from '../outbox/events.js'
import { Mailer } from './mailer.js'
import { ReceiptsProcessor } from './receipts.processor.js'

@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE })],
  providers: [Mailer, ReceiptsProcessor],
})
export class NotificationsModule {}
