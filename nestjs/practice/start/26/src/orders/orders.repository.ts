import { Injectable } from '@nestjs/common'
import type { PricedLine } from '../catalog/pricing.service.js'
import { PrismaService } from '../prisma/prisma.service.js'

const WITH_ITEMS = { items: { orderBy: { id: 'asc' } } } as const

// orders 的資料存取：orders、order_items 兩張表。這是 orders 模組的內部，不給別的模組用
@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(customerId: number, lines: PricedLine[]) {
    const total = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
    return this.prisma.order.create({
      data: { customerId, total, items: { create: lines } },
      include: WITH_ITEMS,
    })
  }

  findWithItems(id: number) {
    return this.prisma.order.findUnique({ where: { id }, include: WITH_ITEMS })
  }

  // 條件更新：只有還是 pending 的訂單會變成 paid。回傳 null 代表沒改到（不存在或已經付過）
  async markPaid(id: number) {
    const { count } = await this.prisma.order.updateMany({ where: { id, status: 'pending' }, data: { status: 'paid' } })
    return count === 1 ? this.prisma.order.findUniqueOrThrow({ where: { id } }) : null
  }
}
