import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { PaymentEvent } from './payment-event.js'

@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 3：同一個事件 id 只能處理一次，而且要記到 webhook_events
  async handle(event: PaymentEvent) {
    await this.prisma.order.update({
      where: { id: event.data.orderId },
      data: { status: 'paid', paidAt: new Date() },
    })
  }
}
