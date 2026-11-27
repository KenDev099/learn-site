import { Injectable } from '@nestjs/common'

// 集點卡：每買一杯集一點。點數由集點卡自己記，不再回頭問 OrdersService
@Injectable()
export class StampsService {
  private readonly stamps = new Map<string, number>()

  add(customer: string) {
    const next = this.count(customer) + 1
    this.stamps.set(customer, next)
    return next
  }

  count(customer: string) {
    return this.stamps.get(customer) ?? 0
  }
}
