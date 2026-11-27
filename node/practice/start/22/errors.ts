// 錯誤類別（這個檔不用改）：上游的錯誤是第 17 課的，OutOfStockError 是第 20 課的
// 呼叫端只要認得這幾個類別，不用知道 fetch、undici 丟出來的各種錯誤長什麼樣
export class UpstreamError extends Error {
  name = 'UpstreamError'
}

// 等太久：超過我們設定的逾時
export class UpstreamTimeoutError extends UpstreamError {
  name = 'UpstreamTimeoutError'
}

// 連不上：連線被拒、DNS 查不到、連線中斷。原始錯誤放在 cause
export class UpstreamUnavailableError extends UpstreamError {
  name = 'UpstreamUnavailableError'
}

// 上游回了非 2xx。retryAfter 是 Retry-After 標頭的原始字串（沒有就是 null）
export class UpstreamHttpError extends UpstreamError {
  name = 'UpstreamHttpError'
  status: number
  retryAfter: string | null
  constructor(status: number, retryAfter: string | null = null) {
    super(`上游回應 ${status}`)
    this.status = status
    this.retryAfter = retryAfter
  }
}

// 上游回了 2xx，但內容不是我們要的格式
export class UpstreamBadResponseError extends UpstreamError {
  name = 'UpstreamBadResponseError'
}

// 庫存不足（第 20 課）
export class OutOfStockError extends Error {
  name = 'OutOfStockError'
  productId: number
  constructor(productId: number, options?: ErrorOptions) {
    super(`商品 ${productId} 庫存不足`, options)
    this.productId = productId
  }
}
