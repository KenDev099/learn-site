import { Module } from '@nestjs/common'
import { ReceiptsListener } from './receipts.listener.js'

// 練習 3：Mailer 屬於 notifications
@Module({
  providers: [ReceiptsListener],
})
export class NotificationsModule {}
