// 第 16 課的 API 層會把伺服器的 422 轉成 ValidationError（這裡只放表單用得到的部分）
export class ValidationError extends Error {
  readonly kind = 'validation'
  /** 每個欄位的錯誤訊息，例如 { phone: ['這支手機號碼已停用'] } */
  readonly fieldErrors: Record<string, string[]>

  constructor(fieldErrors: Record<string, string[]>) {
    super('資料驗證失敗')
    this.name = 'ValidationError'
    this.fieldErrors = fieldErrors
  }
}
