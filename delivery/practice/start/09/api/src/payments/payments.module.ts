import { Module } from '@nestjs/common'
import { CafePayClient } from './cafepay.js'
import { PaymentsController } from './payments.controller.js'
import { PaymentsService } from './payments.service.js'
import { WebhookSignatureGuard } from './webhook-signature.guard.js'

@Module({ controllers: [PaymentsController], providers: [PaymentsService, CafePayClient, WebhookSignatureGuard] })
export class PaymentsModule {}
