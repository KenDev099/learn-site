// 練習 3、4 共用的型別與伺服器錯誤（這個檔案不用改）

export const FIELDS = ['name', 'phone', 'quantity', 'pickupTime'] as const
export type Field = (typeof FIELDS)[number]

/** 表單上每一格的原文（FormData 裡的值都是字串） */
export type OrderValues = Record<Field, string>

/** 驗證通過、轉好型別之後送給伺服器的資料 */
export type OrderInput = { name: string; phone: string; quantity: number; pickupTime: string }

/** useActionState 的 state：每次都回傳同樣的形狀 */
export type OrderState = {
  /** 失敗時是這次送出的原文（用來保留輸入）；一開始和成功時是空字串 */
  values: OrderValues
  /** 每個欄位的錯誤訊息（前端驗證或伺服器回的），沒有錯的欄位不出現 */
  fieldErrors: Partial<Record<Field, string[]>>
  /** 對不到欄位的錯誤（例如網路失敗） */
  formError: string | null
  /** 成功時的訂單編號 */
  orderId: number | null
}

export const EMPTY_VALUES: OrderValues = { name: '', phone: '', quantity: '', pickupTime: '' }
export const initialOrderState: OrderState = { values: EMPTY_VALUES, fieldErrors: {}, formError: null, orderId: null }

export type OrderAction = (prev: OrderState, formData: FormData) => Promise<OrderState>

/** 伺服器回 422：格式正確但內容不符規則（例如時段已額滿），帶著每個欄位的錯誤 */
export class ServerValidationError extends Error {
  fieldErrors: Partial<Record<Field, string[]>>
  constructor(fieldErrors: Partial<Record<Field, string[]>>) {
    super('伺服器驗證失敗')
    this.fieldErrors = fieldErrors
  }
}

export type OrderApi = { placeOrder: (input: OrderInput) => Promise<{ id: number }> }
