import { Injectable } from '@nestjs/common'
import { OrderNotFoundError } from '../errors/domain-errors.js'
import type { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { StampCardsService } from '../stamp-cards/stamp-cards.service.js'
import { transition, type OrderEvent } from './domain/order-state.js'

const ORDER_SELECT = { id: true, customerId: true, total: true, status: true } as const

// 應用層：協調步驟、決定交易邊界。規則本身在 domain/order-state.ts
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stampCards: StampCardsService,
  ) {}

  // 付款和加點要一起成功或一起失敗：同一個交易，tx 一路傳下去
  pay(id: number) {
    return this.prisma.$transaction(async tx => {
      const order = await this.changeStatus(tx, id, 'pay')
      await this.stampCards.addPoints(tx, order.customerId, 1)
      return order
    })
  }

  cancel(id: number) {
    return this.changeStatus(this.prisma, id, 'cancel')
  }

  // 讀出狀態 → 用狀態機算下一步 → 條件更新：只有狀態還是剛剛讀到的那個時才寫入
  private async changeStatus(db: Prisma.TransactionClient, id: number, event: OrderEvent) {
    const order = await db.order.findUnique({ where: { id }, select: { status: true } })
    if (!order) throw new OrderNotFoundError(id)
    const next = transition(order.status, event)
    return db.order.update({ where: { id }, data: { status: next }, select: ORDER_SELECT })
  }
}
