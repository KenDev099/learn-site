// 領域錯誤：路由層看到這些類別就知道要回什麼狀態碼（第 18 課的做法）。這個檔不用改
export class DatabaseUnavailableError extends Error {   // → 503
  name = 'DatabaseUnavailableError'
}

export class ConflictError extends Error {   // → 409
  name = 'ConflictError'
  field: string
  constructor(message: string, field: string, options?: ErrorOptions) {
    super(message, options)
    this.field = field
  }
}

export class ValidationError extends Error {   // → 400
  name = 'ValidationError'
  field: string
  constructor(message: string, field: string, options?: ErrorOptions) {
    super(message, options)
    this.field = field
  }
}

export class OutOfStockError extends Error {   // → 409
  name = 'OutOfStockError'
  productId: number
  constructor(productId: number, options?: ErrorOptions) {
    super(`商品 ${productId} 庫存不足`, options)
    this.productId = productId
  }
}
