import { Injectable } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { PaymentEvent } from './payment-event.js'

// 錯誤寫法：先記事件、再改訂單，兩步不在同一個交易。改訂單失敗時，事件已經記成處理過
@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  async handle(event: PaymentEvent) {
    const order = await this.prisma.order.findFirst({ where: { id: event.data.orderId, status: 'pending' } })
    try {
      await this.prisma.webhookEvent.create({
        data: { eventId: event.id, type: event.type, status: order ? 'processed' : 'ignored' },
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return
      throw e
    }
    if (order) await this.prisma.order.update({ where: { id: order.id }, data: { status: 'paid', paidAt: new Date() } })
  }
}
