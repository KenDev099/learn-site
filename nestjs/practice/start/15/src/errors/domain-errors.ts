// 第 8 課的領域錯誤：service 只說「哪裡不行」，狀態碼由 DomainExceptionFilter 決定
export abstract class DomainError extends Error {
  abstract readonly code: string

  constructor(message: string, readonly details: Record<string, unknown> = {}) {
    super(message)
    this.name = new.target.name
  }
}

export class OutOfStockError extends DomainError {
  readonly code = 'OUT_OF_STOCK'

  constructor(productId: number, requested: number, available: number) {
    super(`商品 ${productId} 庫存不足：要 ${requested}，剩 ${available}`, { productId, requested, available })
  }
}

export class ProductNotFoundError extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND'

  constructor(productId: number) {
    super(`找不到商品 ${productId}`, { productId })
  }
}

// 樂觀鎖：客戶端手上的 version 已經不是最新的
export class StaleVersionError extends DomainError {
  readonly code = 'STALE_VERSION'

  constructor(productId: number, version: number) {
    super(`商品 ${productId} 已經被別人改過（你的版本是 ${version}），請重新整理`, { productId, version })
  }
}

export class InsufficientPointsError extends DomainError {
  readonly code = 'INSUFFICIENT_POINTS'

  constructor(cardId: number, requested: number, balance: number) {
    super(`集點卡 ${cardId} 點數不足：要 ${requested}，剩 ${balance}`, { cardId, requested, balance })
  }
}
