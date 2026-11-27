import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ORDER_PAID, OrderPaidEvent } from '../orders/order-paid.event.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { taipeiDay } from './taipei-day.js'

// 當日營業統計：付款後把這一天的訂單數加 1、營業額加上訂單金額
@Injectable()
export class StatsListener {
  constructor(private readonly prisma: PrismaService) {}

  // 出錯時 @nestjs/event-emitter 預設（suppressErrors: true）只記 error log，不會讓付款失敗
  @OnEvent(ORDER_PAID, { async: true, suppressErrors: false })
  async handleOrderPaid(event: OrderPaidEvent) {
    const day = taipeiDay(event.paidAt)
    await this.prisma.dailyStats.upsert({
      where: { day },
      create: { day, orders: 1, revenue: event.total },
      update: { orders: { increment: 1 }, revenue: { increment: event.total } },
    })
  }
}
