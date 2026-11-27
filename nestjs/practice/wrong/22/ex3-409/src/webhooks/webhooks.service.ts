import { ConflictException, Injectable } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { PaymentEvent } from './payment-event.js'

@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  async handle(event: PaymentEvent) {
    try {
      // 改訂單和記錄事件在同一個交易：要嘛都成功，要嘛都沒發生
      await this.prisma.$transaction(async tx => {
        const { count } = await tx.order.updateMany({
          where: { id: event.data.orderId, status: 'pending' },
          data: { status: 'paid', paidAt: new Date() },
        })
        await tx.webhookEvent.create({
          data: { eventId: event.id, type: event.type, status: count === 1 ? 'processed' : 'ignored' },
        })
      })
    } catch (e) {
      // event_id 的唯一約束擋下重複的事件：已經處理過，當成成功
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('重複的事件')
      throw e
    }
  }
}
