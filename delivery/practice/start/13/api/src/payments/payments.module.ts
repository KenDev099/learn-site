import { Module } from '@nestjs/common'
import { CafePayClient } from './cafepay.js'
import { CafePayV2Client } from './cafepay-v2.js'
import { PaymentsController } from './payments.controller.js'
import { PaymentsService } from './payments.service.js'
import { WebhookSignatureGuard } from './webhook-signature.guard.js'

// exports：CafePayV2Client 給別的模組用（CAFE-50 的退款）。要用的模組在 imports 加上 PaymentsModule
@Module({ controllers: [PaymentsController], providers: [PaymentsService, CafePayClient, CafePayV2Client, WebhookSignatureGuard], exports: [CafePayV2Client] })
export class PaymentsModule {}
