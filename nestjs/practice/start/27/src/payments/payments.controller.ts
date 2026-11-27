import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import type { PaymentEvent } from './payment-event.js'
import { PaymentsService } from './payments.service.js'
import { WebhookSignatureGuard } from './webhook-signature.guard.js'

// 金流公司在付款成功後呼叫這個網址（第 22 課）。回 2xx 代表「收到了」，否則它會重送
@Controller({ path: 'webhooks/payments', version: '1' })
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(WebhookSignatureGuard)
  async receive(@Body() event: PaymentEvent) {
    await this.payments.handle(event)
    return { received: true }
  }
}
