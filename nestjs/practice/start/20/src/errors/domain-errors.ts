// 第 8 課的領域錯誤：service 只說「哪裡不行」，狀態碼由 DomainExceptionFilter 決定
export abstract class DomainError extends Error {
  abstract readonly code: string

  constructor(message: string, readonly details: Record<string, unknown> = {}) {
    super(message)
    this.name = new.target.name
  }
}

export class OrderNotFoundError extends DomainError {
  readonly code = 'ORDER_NOT_FOUND'

  constructor(orderId: number) {
    super(`找不到訂單 ${orderId}`, { orderId })
  }
}

// 第 18 課：條件更新影響 0 列，代表訂單已經不是 pending（付過了或取消了）
export class OrderStateConflictError extends DomainError {
  readonly code = 'ORDER_STATE_CONFLICT'

  constructor(orderId: number) {
    super(`訂單 ${orderId} 不是待付款狀態`, { orderId })
  }
}
