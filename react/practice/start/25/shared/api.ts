// 整個 app 共用的型別與錯誤（已經寫好，不用改）
// 只有這裡知道伺服器長什麼樣子；各個 feature 透過 props 拿到 api，測試換成假的
import type { Category, Product } from '../../../helpers/fake-api.ts'

export type { Category, Product }

export type Size = 'M' | 'L'
export type Sugar = 'normal' | 'less' | 'none'
export type CartOptions = { size: Size; sugar: Sugar }

/** 購物車的一列：同一個商品、同樣的大小與甜度才算同一列 */
export type CartLine = {
  key: string
  productId: number
  name: string
  size: Size
  sugar: Sugar
  /** 這一杯的單價（大杯 +20） */
  unitPrice: number
  quantity: number
}

export type CheckoutInput = {
  name: string
  phone: string
  pickupTime: string
  lines: { productId: number; size: Size; sugar: Sugar; quantity: number }[]
}

export type OrderStatus = 'received' | 'brewing' | 'ready'
export type OrderLine = { name: string; quantity: number }
export type Order = { id: number; customer: string; storeId: number; status: OrderStatus; total: number; lines: OrderLine[] }

export type Role = 'customer' | 'barista' | 'manager'
export type User = { id: number; name: string; role: Role; storeId: number | null }
/** 目前登入的人：null 是沒登入 */
export type Auth = { user: User | null }

type Opts = { signal?: AbortSignal }

export type ShopApi = {
  /** 某個分類的菜單 */
  getCategory(category: Category, opts?: Opts): Promise<Product[]>
  /** 建立訂單。同一個 idempotencyKey 送兩次，伺服器只建立一筆、回傳第一次的結果 */
  createOrder(input: CheckoutInput, idempotencyKey: string): Promise<{ id: number }>
  getOrder(id: number, opts?: Opts): Promise<Order>
  /** 某間門市還沒取餐的訂單 */
  getStoreOrders(storeId: number, opts?: Opts): Promise<Order[]>
  /** 把訂單標成可以取餐 */
  markReady(orderId: number): Promise<Order>
}

/** 伺服器回了錯誤狀態碼；message 是可以給客人看的說明（例如「拿鐵已售完」） */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** 422：伺服器的欄位錯誤，形狀跟 zod 的 flattenError(…).fieldErrors 一樣 */
export class ValidationError extends ApiError {
  readonly fieldErrors: Record<string, string[]>
  constructor(fieldErrors: Record<string, string[]>) {
    super(422, '欄位有誤')
    this.name = 'ValidationError'
    this.fieldErrors = fieldErrors
  }
}

// 監控服務的替身（第 24 課）：正式環境換成 Sentry 這類服務的 SDK
export type ErrorSource = 'caught' | 'uncaught' | 'recoverable' | 'window' | 'promise' | 'handler'
export type Reporter = {
  capture(error: unknown, context: { source: ErrorSource; componentStack?: string }): void
}
