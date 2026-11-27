import { Module } from '@nestjs/common'
import { WebhookSignatureGuard } from './webhook-signature.guard.js'
import { WebhooksController } from './webhooks.controller.js'
import { WebhooksService } from './webhooks.service.js'

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookSignatureGuard],
})
export class WebhooksModule {}
