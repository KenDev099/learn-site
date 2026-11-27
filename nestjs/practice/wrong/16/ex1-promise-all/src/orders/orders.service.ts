import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

export type OrderLine = { productId: number; productName: string; quantity: number; unitPrice: number }
export type OrderSummary = { id: number; customerId: number; total: number; orderedAt: Date; items: OrderLine[] }

// 錯誤寫法：Promise.all 只是同時送出 50 句，還是 N+1
@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findRecent(): Promise<OrderSummary[]> {
    const orders = await this.prisma.order.findMany({ orderBy: { id: 'desc' }, take: 50 })
    return Promise.all(orders.map(async order => {
      const items = await this.prisma.orderItem.findMany({ where: { orderId: order.id }, orderBy: { id: 'asc' }, include: { product: true } })
      return {
        id: order.id, customerId: order.customerId, total: order.total, orderedAt: order.orderedAt,
        items: items.map(i => ({ productId: i.productId, productName: i.product.name, quantity: i.quantity, unitPrice: i.unitPrice })),
      }
    }))
  }
}
