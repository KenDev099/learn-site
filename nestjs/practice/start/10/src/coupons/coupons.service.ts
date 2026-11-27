import { Injectable } from '@nestjs/common'

// expiresOn 是「最後可以用的那一天」，以台北的日期為準：'2026-10-31' 用到台北 10/31 23:59:59
export type Coupon = { code: string, percentOff: number, expiresOn: string }

@Injectable()
export class CouponsService {
  private coupons: Coupon[] = [
    { code: 'HALLOWEEN', percentOff: 20, expiresOn: '2026-10-31' },
    { code: 'XMAS', percentOff: 15, expiresOn: '2026-12-25' },
  ]

  find(code: string) {
    const coupon = this.coupons.find(c => c.code === code)
    return coupon && { ...coupon, valid: this.isValid(coupon) }
  }

  // 練習 3：這裡有兩個問題：直接看真實的時鐘、用的是 UTC 的日期
  private isValid(coupon: Coupon) {
    const today = new Date().toISOString().slice(0, 10)
    return today <= coupon.expiresOn
  }
}
