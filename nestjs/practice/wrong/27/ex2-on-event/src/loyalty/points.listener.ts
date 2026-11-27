import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import type { OrderPaidPayload } from '../outbox/events.js'
import { LoyaltyService } from './loyalty.service.js'

@Injectable()
export class PointsListener {
  constructor(private readonly loyalty: LoyaltyService) {}

  @OnEvent('order.paid', { async: true })
  async handle(payload: OrderPaidPayload) {
    await this.loyalty.earnForOrder(payload)
  }
}
