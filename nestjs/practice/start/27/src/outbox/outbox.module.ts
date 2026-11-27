import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { LOYALTY_QUEUE, NOTIFICATIONS_QUEUE } from './events.js'
import { OutboxRelay } from './outbox.relay.js'
import { OutboxService } from './outbox.service.js'
import { QueuePublisher } from './queue.publisher.js'

@Module({
  imports: [BullModule.registerQueue({ name: LOYALTY_QUEUE }, { name: NOTIFICATIONS_QUEUE })],
  providers: [OutboxService, OutboxRelay, QueuePublisher],
  exports: [OutboxService, QueuePublisher],
})
export class OutboxModule {}
