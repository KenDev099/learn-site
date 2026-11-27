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
