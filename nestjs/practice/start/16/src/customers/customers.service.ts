import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { ListOrdersQuery } from './list-orders.query.js'

export type OrderRow = { id: number; total: number; orderedAt: Date }
export type OrdersPage = { items: OrderRow[]; nextCursor: string | null }

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 2：offset 分頁。翻頁中間有新訂單進來，下一頁就會出現上一頁看過的訂單
  async listOrders(customerId: number, { page, limit }: ListOrdersQuery): Promise<OrdersPage> {
    const items = await this.prisma.order.findMany({
      where: { customerId },
      orderBy: { orderedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, total: true, orderedAt: true },
    })
    return { items, nextCursor: items.length === limit ? String(page + 1) : null }
  }
}
