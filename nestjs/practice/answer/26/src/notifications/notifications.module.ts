import { Module } from '@nestjs/common'
import { OrdersModule } from '../orders/orders.module.js'
import { Mailer } from './mailer.js'
import { ReceiptsListener } from './receipts.listener.js'

// 依賴方向：notifications → orders（用 OrdersService 讀訂單內容）
@Module({
  imports: [OrdersModule],
  providers: [ReceiptsListener, Mailer],
})
export class NotificationsModule {}
