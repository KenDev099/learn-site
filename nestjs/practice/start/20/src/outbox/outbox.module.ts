import { Module } from '@nestjs/common'
import { ReceiptsModule } from '../receipts/receipts.module.js'
import { OutboxRelay } from './outbox.relay.js'

@Module({
  imports: [ReceiptsModule],
  providers: [OutboxRelay],
  exports: [OutboxRelay],
})
export class OutboxModule {}
