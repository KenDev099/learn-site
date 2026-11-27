import { Injectable } from '@nestjs/common'
import { CafePay } from '#cafepay-sdk-v1'

// 呼叫 CafePay（金流商）。PR-60 把原本手寫的 fetch 換成 CafePay 官方的 SDK（cafepay-sdk 1.4.2，放在 vendor/）
// 網址與逾時從環境變數讀（api/.env 的 CAFEPAY_URL、CAFEPAY_TIMEOUT_MS）
// PaymentsService 只認得 PaymentGateway 這個形狀，不認得 SDK：金額一律是元，結果一律是下面這幾種
export type ChargeResult = { id: string | null, status: 'succeeded' | 'failed' }
export type LookupResult = { id: string, status: 'succeeded' | 'failed' } | { id: null, status: 'not_found' }

// 結果不明：請求送出去了，但沒拿到明確的答案（逾時、連線中斷、CafePay 回 5xx）
// CafePay 可能根本沒收到，也可能已經扣款了，只是回應在路上丟了。從這裡分不出來
export class CafePayUnknownError extends Error {}

export interface PaymentGateway {
  // 扣款。Idempotency-Key 相同的請求，CafePay 只扣一次款。卡片被拒絕回 failed；結果不明丟 CafePayUnknownError
  charge(input: { orderId: number, amount: number, cardToken: string }, idempotencyKey: string): Promise<ChargeResult>
  // 查詢某張訂單的付款（補單用）
  findByOrder(orderId: number): Promise<LookupResult>
}

@Injectable()
export class CafePayClient implements PaymentGateway {
  private readonly sdk = new CafePay({ baseUrl: process.env.CAFEPAY_URL ?? 'http://localhost:3190', timeoutMs: Number(process.env.CAFEPAY_TIMEOUT_MS ?? 5000) })

  async charge(input: { orderId: number, amount: number, cardToken: string }, idempotencyKey: string): Promise<ChargeResult> {
    const r = await this.sdk.createPayment({ orderId: input.orderId, amount: input.amount, cardToken: input.cardToken }, { idempotencyKey })
    if (r.ok) return { id: r.payment.id, status: r.payment.status }
    if (r.error.type === 'card_declined') return { id: r.error.paymentId ?? null, status: 'failed' }   // 卡片被拒絕：確定沒有扣款
    if (r.error.type === 'network' || r.error.type === 'server') throw new CafePayUnknownError(`CafePay 結果不明：${r.error.message}`)
    throw new Error(`CafePay 拒絕了這個請求：${r.error.status} ${r.error.message}`)   // 4xx：我們送錯了，CafePay 沒有處理
  }

  async findByOrder(orderId: number): Promise<LookupResult> {
    const r = await this.sdk.findPayment(orderId)
    if (r.ok) return { id: r.payment.id, status: r.payment.status }
    if (r.error.type === 'not_found') return { id: null, status: 'not_found' }
    throw new Error(`CafePay 查詢失敗：${r.error.type} ${r.error.message}`)
  }
}
