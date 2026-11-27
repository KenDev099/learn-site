// 領域錯誤：用業務的語言描述「哪裡不行」，不帶 HTTP 狀態碼
//   code：給程式判斷用、不會因為改文案而變的字串（也就是回應裡的 errorCode）
//   details：前端需要的補充資料，例如哪一個商品、還剩幾個
export abstract class DomainError extends Error {
  abstract readonly code: string

  constructor(message: string, readonly details: Record<string, unknown> = {}, options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name
  }
}

export class OutOfStockError extends DomainError {
  readonly code = 'OUT_OF_STOCK'

  constructor(productId: number, requested: number, available: number) {
    super(`商品 ${productId} 庫存不足：要 ${requested}，剩 ${available}`, { productId, requested, available })
  }
}

// 練習 1：照 OutOfStockError 的樣子寫 ProductNotFoundError
//   code 是 'PRODUCT_NOT_FOUND'，建構子收 productId，details 是 { productId }
