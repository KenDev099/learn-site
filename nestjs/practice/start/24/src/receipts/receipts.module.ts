import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { Mailer } from './mailer.js'
import { ReceiptsProcessor } from './receipts.processor.js'
import { RECEIPTS_QUEUE, ReceiptsProducer } from './receipts.producer.js'

@Module({
  imports: [BullModule.registerQueue({ name: RECEIPTS_QUEUE })],
  providers: [ReceiptsProducer, ReceiptsProcessor, Mailer],
  exports: [ReceiptsProducer],
})
export class ReceiptsModule {}
