import { Injectable } from '@nestjs/common'
import type { Product } from './product.js'

// 快樂時光：每天 14:00–16:00（台北時間）飲品（coffee、tea）打八折
@Injectable()
export class PricingService {
  priceOf(product: Product): number {
    const hour = new Date().getHours()
    if (product.category !== 'food' && hour >= 14 && hour <= 16) return Math.round(product.price * 0.8)
    return product.price
  }
}
