import { Module } from '@nestjs/common'
import { Mailer } from './mailer.js'
import { ReceiptsListener } from './receipts.listener.js'

// 不 import OrdersModule：PrismaModule 是全域的，自己查訂單就好
@Module({
  providers: [ReceiptsListener, Mailer],
})
export class NotificationsModule {}
