import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

export type OrderLine = { productId: number; productName: string; quantity: number; unitPrice: number }
export type OrderSummary = { id: number; customerId: number; total: number; orderedAt: Date; items: OrderLine[] }

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // 3 句 SQL：訂單一句、明細一句（order_id IN (...)）、商品一句（id IN (...)），不管有幾張訂單
  async findRecent(): Promise<OrderSummary[]> {
    const orders = await this.prisma.order.findMany({
      orderBy: { id: 'desc' },
      take: 50,
      select: {
        id: true,
        customerId: true,
        total: true,
        orderedAt: true,
        items: {
          orderBy: { id: 'asc' },
          select: { productId: true, quantity: true, unitPrice: true, product: { select: { name: true } } },
        },
      },
    })
    return orders.map(({ items, ...order }) => ({
      ...order,
      items: items.map(({ product, ...item }) => ({ ...item, productName: product.name })),
    }))
  }
}
