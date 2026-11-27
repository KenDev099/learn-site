import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

export type OrderLine = { productId: number; productName: string; quantity: number; unitPrice: number }
export type OrderSummary = { id: number; customerId: number; total: number; orderedAt: Date; items: OrderLine[] }

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 1：結果是對的，但 50 筆訂單會送出 1 + 50 + 100 句 SQL
  async findRecent(): Promise<OrderSummary[]> {
    const orders = await this.prisma.order.findMany({ orderBy: { id: 'desc' }, take: 50 })
    const result: OrderSummary[] = []
    for (const order of orders) {
      const items = await this.prisma.orderItem.findMany({ where: { orderId: order.id }, orderBy: { id: 'asc' } })
      const lines: OrderLine[] = []
      for (const item of items) {
        const product = await this.prisma.product.findUniqueOrThrow({ where: { id: item.productId } })
        lines.push({ productId: item.productId, productName: product.name, quantity: item.quantity, unitPrice: item.unitPrice })
      }
      result.push({ id: order.id, customerId: order.customerId, total: order.total, orderedAt: order.orderedAt, items: lines })
    }
    return result
  }
}
