// 第 8 課的領域錯誤：code 會變成回應裡的 errorCode
export abstract class DomainError extends Error {
  abstract readonly code: string

  constructor(message: string, readonly details: Record<string, unknown> = {}) {
    super(message)
    this.name = new.target.name
  }
}

export class TooManyItemsError extends DomainError {
  readonly code = 'TOO_MANY_ITEMS'

  constructor(requested: number, max: number) {
    super(`一張訂單最多 ${max} 杯，這張有 ${requested} 杯`, { requested, max })
  }
}

export class ProductNotFoundError extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND'

  constructor(productId: number) {
    super(`找不到商品 ${productId}`, { productId })
  }
}
