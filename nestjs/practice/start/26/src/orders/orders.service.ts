import { ConflictException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PricingService, type ItemInput } from '../catalog/pricing.service.js'
import { LoyaltyService } from '../loyalty/loyalty.service.js'
import { ORDER_PAID, OrderPaidEvent } from './events/order-paid.event.js'
import { OrdersRepository } from './orders.repository.js'

@Injectable()
export class OrdersService {
  constructor(
    private readonly repo: OrdersRepository,
    private readonly pricing: PricingService,
    private readonly events: EventEmitter2,
    @Inject(forwardRef(() => LoyaltyService)) private readonly loyalty: LoyaltyService,
  ) {}

  async create(customerId: number, items: ItemInput[]) {
    return this.repo.create(customerId, await this.pricing.quote(items))
  }

  // orders 的公開查詢：別的模組要訂單內容就呼叫這個
  async findOne(id: number) {
    const order = await this.repo.findWithItems(id)
    if (!order) throw new NotFoundException(`找不到訂單 ${id}`)
    return order
  }

  async pay(id: number) {
    const order = await this.repo.markPaid(id)
    if (!order) {
      await this.findOne(id)   // 不存在 → 404
      throw new ConflictException(`訂單 ${id} 已經付過了`)
    }
    await this.loyalty.addPointsForOrder(order.id)   // 練習 1：改成由 loyalty 訂閱 order.paid
    this.events.emit(ORDER_PAID, new OrderPaidEvent(order.id, order.customerId, order.total, new Date()))
    return order
  }
}
