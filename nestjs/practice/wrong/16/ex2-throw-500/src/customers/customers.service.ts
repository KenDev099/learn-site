import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { ListOrdersQuery } from './list-orders.query.js'

export type OrderRow = { id: number; total: number; orderedAt: Date }
export type OrdersPage = { items: OrderRow[]; nextCursor: string | null }

type Cursor = { orderedAt: Date; id: number }

// cursor 對前端是一串看不懂的字：裡面是最後一筆的兩個排序值，用 base64url 包起來
function encodeCursor({ orderedAt, id }: Cursor) {
  return Buffer.from(JSON.stringify([orderedAt.toISOString(), id])).toString('base64url')
}

function decodeCursor(raw: string): Cursor {
  const [at, id] = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  return { orderedAt: new Date(at), id }
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrders(customerId: number, { cursor, limit }: ListOrdersQuery): Promise<OrdersPage> {
    const after = cursor === undefined ? undefined : decodeCursor(cursor)
    const rows = await this.prisma.order.findMany({
      where: {
        customerId,
        // 排在 cursor 之後：時間更早，或時間相同但 id 更小
        ...(after && { OR: [{ orderedAt: { lt: after.orderedAt } }, { orderedAt: after.orderedAt, id: { lt: after.id } }] }),
      },
      orderBy: [{ orderedAt: 'desc' }, { id: 'desc' }],   // id 是平手處理：時間相同時順序也固定
      take: limit + 1,                                      // 多拿一筆，才知道後面還有沒有
      select: { id: true, total: true, orderedAt: true },
    })
    const items = rows.slice(0, limit)
    return { items, nextCursor: rows.length > limit ? encodeCursor(items[items.length - 1]) : null }
  }
}
