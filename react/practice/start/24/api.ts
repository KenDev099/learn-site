// 結帳 API 的型別與錯誤類別。這個檔案不用改
/** 伺服器回了錯誤狀態碼；message 是伺服器給的、可以給客人看的說明（例如「拿鐵庫存不足」） */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export type CheckoutApi = {
  checkout(): Promise<{ orderId: number }>
}
