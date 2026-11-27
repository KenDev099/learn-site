import { Injectable } from '@nestjs/common'
import { OrderPaidEvent } from '../orders/order-paid.event.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { taipeiDay } from './taipei-day.js'

// 當日營業統計：付款後把這一天的訂單數加 1、營業額加上訂單金額
@Injectable()
export class StatsListener {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 5：收到 order.paid 時更新 daily_stats（day 用 taipeiDay(event.paidAt)）
  async handleOrderPaid(event: OrderPaidEvent) {}
}
