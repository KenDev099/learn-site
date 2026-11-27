import { Inject, Injectable } from '@nestjs/common'
import { CLOCK, type Clock } from './clock.js'
import type { Product } from './product.js'

const taipeiHour = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', hour: 'numeric', hourCycle: 'h23' })

// 快樂時光：每天 14:00–16:00（台北時間，含 14:00、不含 16:00）飲品（coffee、tea）打八折
@Injectable()
export class PricingService {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  priceOf(product: Product): number {
    const hour = Number(taipeiHour.format(new Date()))
    if (product.category !== 'food' && hour >= 14 && hour < 16) return Math.round(product.price * 0.8)
    return product.price
  }
}
