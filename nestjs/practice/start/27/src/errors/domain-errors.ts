// 第 8 課的領域錯誤：service 只說「哪裡不行」，狀態碼由 DomainExceptionFilter 決定
//   code：給程式判斷用、不會因為改文案而變的字串（回應裡的 errorCode）
export abstract class DomainError extends Error {
  abstract readonly code: string

  constructor(message: string, readonly details: Record<string, unknown> = {}) {
    super(message)
    this.name = new.target.name
  }
}

export class ProductNotFoundError extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND'
  constructor(productId: number) {
    super(`找不到商品 ${productId}`, { productId })
  }
}

export class OutOfStockError extends DomainError {
  readonly code = 'OUT_OF_STOCK'
  constructor(productId: number, requested: number, available: number) {
    super(`商品 ${productId} 庫存不足：要 ${requested}，剩 ${available}`, { productId, requested, available })
  }
}

export class OrderNotFoundError extends DomainError {
  readonly code = 'ORDER_NOT_FOUND'
  constructor(orderId: number) {
    super(`找不到訂單 ${orderId}`, { orderId })
  }
}

// 下單一定要帶 Idempotency-Key 標頭：1–64 個英數、-、_（前端用 crypto.randomUUID() 產生）
export class IdempotencyKeyRequiredError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_REQUIRED'
  constructor() {
    super('下單要帶 Idempotency-Key 標頭（1–64 個英數、-、_）')
  }
}

// 同一個 key 配上不同的請求內容：多半是前端的 bug（重複用了 key），不能默默回傳舊訂單
export class IdempotencyKeyReusedError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_REUSED'
  constructor(key: string) {
    super(`Idempotency-Key ${key} 已經用在內容不同的請求`, { key })
  }
}

// 同一個 key 的第一個請求還在處理中（請稍後重試）
export class IdempotencyKeyInProgressError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_IN_PROGRESS'
  constructor(key: string) {
    super(`Idempotency-Key ${key} 的請求還在處理中，請稍後再試`, { key })
  }
}
