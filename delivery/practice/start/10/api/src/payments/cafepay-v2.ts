import { Injectable } from '@nestjs/common'
import { CafePay, CafePayError } from '#cafepay-sdk-v2'
import { CafePayUnknownError, type ChargeResult, type LookupResult, type PaymentGateway } from './cafepay.js'

// 用 cafepay-sdk 2.0.0 實作同一個 PaymentGateway（破壞性變更見 vendor/cafepay-sdk-2.0.0/CHANGELOG.md）
// 新舊兩版並存期間才需要這一層：全部切到 v2、移除 v1 之後，PaymentGateway 介面跟 cafepay.ts 一起收掉

// 元 → 分（最小貨幣單位的整數）。結果一定要是整數
export function toMinor(yuan: number): number {
  // 練習 2：TODO
  return yuan
}

@Injectable()
export class CafePayV2Client implements PaymentGateway {
  private readonly sdk = new CafePay({ baseUrl: process.env.CAFEPAY_URL ?? 'http://localhost:3190', timeoutMs: Number(process.env.CAFEPAY_TIMEOUT_MS ?? 5000) })

  async charge(input: { orderId: number, amount: number, cardToken: string }, idempotencyKey: string): Promise<ChargeResult> {
    // 練習 2：TODO 用 this.sdk.payments.create(…)，回傳的結果跟 CafePayClient.charge() 一樣
    throw new Error('CafePayV2Client.charge() 還沒實作')
  }

  async findByOrder(orderId: number): Promise<LookupResult> {
    // 練習 2：TODO 用 this.sdk.findPayment(…)，回傳的結果跟 CafePayClient.findByOrder() 一樣
    throw new Error('CafePayV2Client.findByOrder() 還沒實作')
  }
}
