// cafepay-sdk 1.4.2
export interface CafePayOptions {
  /** CafePay API 的網址，例如 https://api.cafepay.example */
  baseUrl: string
  /** 每個請求最多等幾毫秒（預設 5000） */
  timeoutMs?: number
}

export interface Payment {
  id: string
  orderId: number
  /** 金額（元） */
  amount: number
  status: 'succeeded' | 'failed'
}

export type CafePayErrorType =
  | 'card_declined'    // 卡片被拒絕（確定沒有扣款）
  | 'invalid_request'  // 參數錯誤、Idempotency-Key 用在不同的付款上
  | 'not_found'        // 查無付款
  | 'network'          // 逾時或連線中斷：不知道 CafePay 有沒有處理
  | 'server'           // CafePay 回 5xx：不知道有沒有處理

export type Result<T> =
  | { ok: true, payment: T }
  | { ok: false, error: { type: CafePayErrorType, message: string, status?: number, paymentId?: string } }

export declare class CafePay {
  constructor(options: CafePayOptions)
  /** 建立付款（扣款）。同一個 idempotencyKey 只會扣一次款 */
  createPayment(input: { orderId: number, amount: number, cardToken: string }, options: { idempotencyKey: string }): Promise<Result<Payment>>
  /** 查詢某張訂單的付款 */
  findPayment(orderId: number): Promise<Result<Payment>>
}
