// cafepay-sdk 2.1.0
export interface CafePayOptions {
  /** CafePay API 的網址，例如 https://api.cafepay.example */
  baseUrl: string
  /** 每個請求最多等幾毫秒（預設 5000） */
  timeoutMs?: number
}

export interface Payment {
  id: string
  orderId: number
  /** 金額，最小貨幣單位的整數（新台幣 1 元 = 100） */
  amount: number
  status: 'succeeded' | 'failed'
}

export type CafePayErrorCode =
  | 'card_declined'    // 卡片被拒絕（確定沒有扣款）
  | 'invalid_request'  // 參數錯誤（例如金額不是整數）、Idempotency-Key 用在不同的付款上
  | 'not_found'        // 查無付款
  | 'network'          // 逾時或連線中斷：不知道 CafePay 有沒有處理
  | 'server'           // CafePay 回 5xx：不知道有沒有處理

/** 所有失敗都丟出這個錯誤 */
export declare class CafePayError extends Error {
  readonly code: CafePayErrorCode
  /** CafePay 回的 HTTP 狀態碼（network 時沒有） */
  readonly status?: number
  /** 卡片被拒絕時，被拒絕的那筆付款的編號 */
  readonly paymentId?: string
}

export interface CreatePaymentParams {
  orderId: number
  /** 最小貨幣單位的整數（110 元 → 11000） */
  amount: number
  cardToken: string
  idempotencyKey: string
}

export interface Refund {
  id: string
  paymentId: string
  /** 退款金額，最小貨幣單位的整數 */
  amount: number
  status: 'succeeded'
}

export interface CreateRefundParams {
  /** 要退的那筆付款（Payment.id，pay_…） */
  paymentId: string
  /** 最小貨幣單位的整數；全額退款就是付款的金額 */
  amount: number
  idempotencyKey: string
}

export declare class CafePay {
  constructor(options: CafePayOptions)
  readonly payments: {
    /** 建立付款（扣款）。同一個 idempotencyKey 只會扣一次款。失敗時丟出 CafePayError */
    create(params: CreatePaymentParams): Promise<Payment>
  }
  /** 2.1.0 新增 */
  readonly refunds: {
    /** 退款。同一個 idempotencyKey 只會退一次款。付款不存在丟出 CafePayError（code: 'not_found'） */
    create(params: CreateRefundParams): Promise<Refund>
  }
  /** 查詢某張訂單的付款。查無付款時丟出 CafePayError（code: 'not_found'） */
  findPayment(orderId: number): Promise<Payment>
}
