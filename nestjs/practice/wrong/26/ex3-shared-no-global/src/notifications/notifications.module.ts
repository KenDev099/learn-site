import { Module } from '@nestjs/common'
import { SharedModule } from '../shared/shared.module.js'
import { ReceiptsListener } from './receipts.listener.js'

@Module({
  imports: [SharedModule],
  providers: [ReceiptsListener],
})
export class NotificationsModule {}
