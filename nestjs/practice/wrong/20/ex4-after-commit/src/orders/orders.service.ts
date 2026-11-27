import { Injectable } from '@nestjs/common'
import { OrderNotFoundError, OrderStateConflictError } from '../errors/domain-errors.js'
import type { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { ReceiptsProducer } from '../receipts/receipts.producer.js'

const ORDER_SELECT = { id: true, customerId: true, total: true, status: true } as const

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService, private readonly receipts: ReceiptsProducer) {}

  // 訂單改成 paid 和「要寄收據」的事件寫在同一個交易：一起成功或一起回滾。真正放進佇列交給 OutboxRelay
  async pay(id: number) {
    const order = await this.prisma.$transaction(tx => this.markPaid(tx, id))
    await this.receipts.enqueue(id)
    return order
  }

  // 第 18 課的條件更新：只有 pending 的訂單會變成 paid
  private async markPaid(tx: Prisma.TransactionClient, id: number) {
    const { count } = await tx.order.updateMany({ where: { id, status: 'pending' }, data: { status: 'paid' } })
    if (count === 0) {
      const exists = await tx.order.findUnique({ where: { id }, select: { id: true } })
      throw exists ? new OrderStateConflictError(id) : new OrderNotFoundError(id)
    }
    return tx.order.findUniqueOrThrow({ where: { id }, select: ORDER_SELECT })
  }
}
