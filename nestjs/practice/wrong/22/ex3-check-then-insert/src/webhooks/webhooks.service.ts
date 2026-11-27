import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { PaymentEvent } from './payment-event.js'

// 錯誤寫法：先查有沒有處理過再寫入，沒有唯一約束。同時送來的請求都查到「沒有」，全部都處理
@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  async handle(event: PaymentEvent) {
    await this.prisma.$transaction(async tx => {
      if (await tx.webhookEvent.findFirst({ where: { eventId: event.id } })) return
      const { count } = await tx.order.updateMany({
        where: { id: event.data.orderId, status: 'pending' },
        data: { status: 'paid', paidAt: new Date() },
      })
      await tx.webhookEvent.create({
        data: { eventId: event.id, type: event.type, status: count === 1 ? 'processed' : 'ignored' },
      })
    })
  }
}
