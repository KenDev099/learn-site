import { Inject, Injectable } from '@nestjs/common'

// 第 3 課的做法：「現在幾點」由 CLOCK 提供，測試時換成固定的時間
export const CLOCK = Symbol('CLOCK')
export type Clock = { now(): Date }

export type MenuItem = { name: string; price: number; category: 'drink' | 'food' }

// 台北的「幾點」（0–23）。Date 只存 UTC 毫秒數，要指定時區才知道台北是幾點
function taipeiHour(date: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', hour: 'numeric', hourCycle: 'h23' }).format(date))
}

// 快樂時光：每天 14:00–16:00（台北時間，含 14:00、不含 16:00）飲品打八折
@Injectable()
export class PricingService {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  isHappyHour(): boolean {
    const hour = taipeiHour(this.clock.now())
    return hour >= 14 && hour < 16
  }

  priceOf(item: MenuItem): number {
    return item.category === 'drink' && this.isHappyHour() ? Math.round(item.price * 0.8) : item.price
  }
}
