import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { OrderNotFoundError, OrderStateConflictError } from '../errors/domain-errors.js'
import type { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { StampCardsService } from '../stamp-cards/stamp-cards.service.js'
import { transition, type OrderEvent } from './domain/order-state.js'
import { ORDER_PAID, OrderPaidEvent } from './order-paid.event.js'

const ORDER_SELECT = { id: true, customerId: true, total: true, status: true } as const

// 應用層：協調步驟、決定交易邊界。規則本身在 domain/order-state.ts（第 18 課）
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stampCards: StampCardsService,
    private readonly events: EventEmitter2,
  ) {}

  // 付款和加點要一起成功或一起失敗：同一個交易
  // commit 之後才發事件：交易回滾時，不能讓廚房開始做一杯沒付錢的咖啡
  async pay(id: number) {
    const order = await this.prisma.$transaction(async tx => {
      const paid = await this.changeStatus(tx, id, 'pay')
      await this.stampCards.addPoints(tx, paid.customerId, 1)
      return paid
    })
    await this.events.emitAsync(ORDER_PAID, new OrderPaidEvent(order.id, order.customerId, order.total, new Date()))
    return order
  }

  cancel(id: number) {
    return this.changeStatus(this.prisma, id, 'cancel')
  }

  // 讀出狀態 → 用狀態機算下一步 → 條件更新：只有狀態還是剛剛讀到的那個時才寫入
  private async changeStatus(db: Prisma.TransactionClient, id: number, event: OrderEvent) {
    const order = await db.order.findUnique({ where: { id }, select: { status: true } })
    if (!order) throw new OrderNotFoundError(id)
    const next = transition(order.status, event)
    const { count } = await db.order.updateMany({ where: { id, status: order.status }, data: { status: next } })
    if (count === 0) throw new OrderStateConflictError(id)
    return db.order.findUniqueOrThrow({ where: { id }, select: ORDER_SELECT })
  }
}
