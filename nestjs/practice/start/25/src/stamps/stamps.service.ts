import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { OrdersService } from '../orders/orders.service.js'

// 集點卡：每買一杯集一點
@Injectable()
export class StampsService {
  constructor(@Inject(forwardRef(() => OrdersService)) private readonly orders: OrdersService) {}

  count(customer: string) {
    return this.orders.countFor(customer)
  }
}
