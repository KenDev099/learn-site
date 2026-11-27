// 第 8 課的領域錯誤：service 和領域函式只說「哪裡不行」，狀態碼由 DomainExceptionFilter 決定
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

// 條件更新影響 0 列：讀到的狀態在寫入之前已經被別的請求改掉了
export class OrderStateConflictError extends DomainError {
  readonly code = 'ORDER_STATE_CONFLICT'

  constructor(orderId: number) {
    super(`訂單 ${orderId} 的狀態剛剛被別的請求改掉了，請重新整理`, { orderId })
  }
}

export class StampCardNotFoundError extends DomainError {
  readonly code = 'STAMP_CARD_NOT_FOUND'

  constructor(customerId: number) {
    super(`顧客 ${customerId} 沒有集點卡`, { customerId })
  }
}
