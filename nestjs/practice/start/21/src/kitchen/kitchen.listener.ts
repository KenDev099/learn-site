import { Injectable } from '@nestjs/common'
import { OrderPaidEvent } from '../orders/order-paid.event.js'
import { PrismaService } from '../prisma/prisma.service.js'

// 廚房看板：訂單付款後新增一筆通知。漏掉一筆時店員還能從訂單列表看到，所以用程序內事件就夠了
@Injectable()
export class KitchenListener {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 4：收到 order.paid 時，在 kitchen_notices 新增一筆 { orderId }
  async handleOrderPaid(event: OrderPaidEvent) {}
}
