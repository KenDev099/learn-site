import { Inject, Injectable } from '@nestjs/common'
import { CLOCK, type Clock } from './clock.js'
import type { Product } from './product.js'

// 沒指定 timeZone：用的是伺服器所在地的時區，在台北的 Mac 上剛好對，部署到 UTC 的機器就錯
const localHour = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23' })

@Injectable()
export class PricingService {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  priceOf(product: Product): number {
    const hour = Number(localHour.format(this.clock.now()))
    if (product.category !== 'food' && hour >= 14 && hour < 16) return Math.round(product.price * 0.8)
    return product.price
  }
}
