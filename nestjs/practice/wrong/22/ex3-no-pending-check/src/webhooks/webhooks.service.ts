import { Injectable } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { PaymentEvent } from './payment-event.js'

// 錯誤寫法：更新訂單只看 id、不看 status: pending。另一個事件 id 會把已付款的訂單再付一次（paidAt 被改掉）
@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  async handle(event: PaymentEvent) {
    try {
      await this.prisma.$transaction(async tx => {
        const order = await tx.order.findUnique({ where: { id: event.data.orderId } })
        if (order) await tx.order.update({ where: { id: order.id }, data: { status: 'paid', paidAt: new Date() } })
        await tx.webhookEvent.create({
          data: { eventId: event.id, type: event.type, status: order ? 'processed' : 'ignored' },
        })
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return
      throw e
    }
  }
}
