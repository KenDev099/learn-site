import { Injectable } from '@nestjs/common'
import { CafePay, CafePayError } from '#cafepay-sdk-v2'
import { CafePayUnknownError, type ChargeResult, type LookupResult, type PaymentGateway } from './cafepay.js'

// 用 cafepay-sdk 2.x 實作同一個 PaymentGateway（破壞性變更與 2.1.0 的退款見 vendor/cafepay-sdk-2.1.0/CHANGELOG.md）
// 新舊兩版並存期間才需要這一層：全部切到 v2、移除 v1 之後，PaymentGateway 介面跟 cafepay.ts 一起收掉

// 元 → 分（最小貨幣單位的整數）。結果一定要是整數
export function toMinor(yuan: number): number {
  // 19.9 * 100 是 1989.9999999999998：乘完四捨五入到整數。乘完離整數太遠，代表元有兩位以上的小數，是上游的 bug
  const minor = Math.round(yuan * 100)
  if (!Number.isSafeInteger(minor) || Math.abs(minor - yuan * 100) > 1e-6) throw new Error(`金額 ${yuan} 元換不成整數的分`)
  return minor
}

// 2.0 丟出的錯誤換成 PaymentsService 認得的：network、server＝結果不明；其他＝我們送錯了
function unexpected(e: CafePayError) {
  if (e.code === 'network' || e.code === 'server') return new CafePayUnknownError(`CafePay 結果不明：${e.message}`, { cause: e })
  return new Error(`CafePay 拒絕了這個請求：${e.status} ${e.message}`, { cause: e })
}

@Injectable()
export class CafePayV2Client implements PaymentGateway {
  private readonly sdk = new CafePay({ baseUrl: process.env.CAFEPAY_URL ?? 'http://localhost:3190', timeoutMs: Number(process.env.CAFEPAY_TIMEOUT_MS ?? 5000) })

  async charge(input: { orderId: number, amount: number, cardToken: string }, idempotencyKey: string): Promise<ChargeResult> {
    try {
      const payment = await this.sdk.payments.create({ orderId: input.orderId, amount: toMinor(input.amount), cardToken: input.cardToken, idempotencyKey })
      return { id: payment.id, status: payment.status }
    } catch (e) {
      if (!(e instanceof CafePayError)) throw e
      if (e.code === 'card_declined') return { id: e.paymentId ?? null, status: 'failed' }   // 卡片被拒絕：確定沒有扣款
      throw unexpected(e)
    }
  }

  // 退款（CAFE-50，cafepay-sdk 2.1.0）：金額是元，這裡換成分。同一把 idempotencyKey 只會退一次款
  // 回傳 CafePay 的退款編號（re_…）；結果不明（逾時、5xx）丟 CafePayUnknownError，其他失敗丟一般的 Error
  // 1.x 沒有退款：用 1.4.2 付的款也從這裡退（CafePay 兩版共用同一份付款紀錄）
  async refund(input: { paymentId: string, amount: number }, idempotencyKey: string): Promise<{ id: string }> {
    try {
      const refund = await this.sdk.refunds.create({ paymentId: input.paymentId, amount: toMinor(input.amount), idempotencyKey })
      return { id: refund.id }
    } catch (e) {
      if (!(e instanceof CafePayError)) throw e
      throw unexpected(e)
    }
  }

  async findByOrder(orderId: number): Promise<LookupResult> {
    try {
      const payment = await this.sdk.findPayment(orderId)
      return { id: payment.id, status: payment.status }
    } catch (e) {
      if (!(e instanceof CafePayError)) throw e
      if (e.code === 'not_found') return { id: null, status: 'not_found' }
      throw unexpected(e)
    }
  }
}
