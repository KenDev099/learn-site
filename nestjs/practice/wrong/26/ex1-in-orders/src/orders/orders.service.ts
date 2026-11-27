import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PricingService, type ItemInput } from '../catalog/pricing.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { ORDER_PAID, OrderPaidEvent } from './events/order-paid.event.js'
import { OrdersRepository } from './orders.repository.js'

// 沒有循環了，因為 orders 自己加點：loyalty 的資料表被 orders 直接寫
@Injectable()
export class OrdersService {
  constructor(
    private readonly repo: OrdersRepository,
    private readonly pricing: PricingService,
    private readonly events: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  async create(customerId: number, items: ItemInput[]) {
    return this.repo.create(customerId, await this.pricing.quote(items))
  }

  async findOne(id: number) {
    const order = await this.repo.findWithItems(id)
    if (!order) throw new NotFoundException(`找不到訂單 ${id}`)
    return order
  }

  async pay(id: number) {
    const order = await this.repo.markPaid(id)
    if (!order) {
      await this.findOne(id)
      throw new ConflictException(`訂單 ${id} 已經付過了`)
    }
    const points = Math.floor(order.total / 100)
    if (points > 0) {
      const card = await this.prisma.stampCard.upsert({ where: { customerId: order.customerId }, create: { customerId: order.customerId }, update: {} })
      await this.prisma.pointTransaction.create({ data: { cardId: card.id, orderId: order.id, points, reason: '消費' } })
    }
    this.events.emit(ORDER_PAID, new OrderPaidEvent(order.id, order.customerId, order.total, new Date()))
    return order
  }
}
