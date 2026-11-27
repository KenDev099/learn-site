import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

export type OrderLine = { productId: number; productName: string; quantity: number; unitPrice: number }
export type OrderSummary = { id: number; customerId: number; total: number; orderedAt: Date; items: OrderLine[] }

// 錯誤寫法：3 句 SQL，但把整張 order_items 撈回來在 JavaScript 過濾
@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findRecent(): Promise<OrderSummary[]> {
    const orders = await this.prisma.order.findMany({ orderBy: { id: 'desc' }, take: 50 })
    const items = await this.prisma.orderItem.findMany({ orderBy: { id: 'asc' } })
    const products = await this.prisma.product.findMany()
    const name = new Map(products.map(p => [p.id, p.name]))
    return orders.map(order => ({
      id: order.id, customerId: order.customerId, total: order.total, orderedAt: order.orderedAt,
      items: items.filter(i => i.orderId === order.id)
        .map(i => ({ productId: i.productId, productName: name.get(i.productId)!, quantity: i.quantity, unitPrice: i.unitPrice })),
    }))
  }
}
