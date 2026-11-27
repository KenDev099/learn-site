import { Module } from '@nestjs/common'
import { OrdersModule } from '../orders/orders.module.js'
import { OutboxModule } from '../outbox/outbox.module.js'
import { PaymentsController } from './payments.controller.js'
import { PaymentsService } from './payments.service.js'
import { WebhookSignatureGuard } from './webhook-signature.guard.js'

@Module({
  imports: [OrdersModule, OutboxModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, WebhookSignatureGuard],
})
export class PaymentsModule {}
