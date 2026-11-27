import { Inject, Injectable } from '@nestjs/common'
import { CLOCK, type Clock } from '../clock.js'

// expiresOn 是「最後可以用的那一天」，以台北的日期為準：'2026-10-31' 用到台北 10/31 23:59:59
export type Coupon = { code: string, percentOff: number, expiresOn: string }

// 台北的日期 'YYYY-MM-DD'：不管伺服器設在哪個時區都一樣（sv-SE 的日期格式剛好是 YYYY-MM-DD）
const taipeiDate = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(date)

@Injectable()
export class CouponsService {
  private coupons: Coupon[] = [
    { code: 'HALLOWEEN', percentOff: 20, expiresOn: '2026-10-31' },
    { code: 'XMAS', percentOff: 15, expiresOn: '2026-12-25' },
  ]

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  find(code: string) {
    const coupon = this.coupons.find(c => c.code === code)
    return coupon && { ...coupon, valid: this.isValid(coupon) }
  }

  private isValid(coupon: Coupon) {
    return this.clock.now().toISOString().slice(0, 10) <= coupon.expiresOn
  }
}
