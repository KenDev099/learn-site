// 第 8 課的領域錯誤：code 會變成回應裡的 errorCode，HTTP 狀態碼由 DomainExceptionFilter 決定
export abstract class DomainError extends Error {
  abstract readonly code: string

  constructor(message: string, readonly details: Record<string, unknown> = {}, options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name
  }
}

export class ProductNotFoundError extends DomainError {
  readonly code = 'PRODUCT_NOT_FOUND'

  constructor(productId: number, options?: ErrorOptions) {
    super(`找不到商品 ${productId}`, { productId }, options)
  }
}

export class ProductNameTakenError extends DomainError {
  readonly code = 'PRODUCT_NAME_TAKEN'

  constructor(name: string, options?: ErrorOptions) {
    super(`已經有叫「${name}」的商品`, { name }, options)
  }
}

export class ProductUnavailableError extends DomainError {
  readonly code = 'PRODUCT_UNAVAILABLE'

  constructor(productIds: number[]) {
    super(`這些商品不存在或已停售：${productIds.join(', ')}`, { productIds })
  }
}

export class OrderNotFoundError extends DomainError {
  readonly code = 'ORDER_NOT_FOUND'

  constructor(orderId: number) {
    super(`找不到訂單 ${orderId}`, { orderId })
  }
}
