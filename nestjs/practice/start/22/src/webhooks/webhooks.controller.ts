import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import type { PaymentEvent } from './payment-event.js'
import { WebhookSignatureGuard } from './webhook-signature.guard.js'
import { WebhooksService } from './webhooks.service.js'

// 金流公司在付款成功後呼叫這個網址。不用改這個檔案
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post('payments')
  @HttpCode(200)
  @UseGuards(WebhookSignatureGuard)   // 簽章不對的請求，到不了下面的方法
  async receive(@Body() event: PaymentEvent) {
    await this.webhooks.handle(event)
    return { received: true }
  }
}
