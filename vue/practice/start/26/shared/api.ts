// shared/api：整個 app 唯一知道「怎麼跟伺服器說話」的地方（第 16、25 課）
// 這個檔案已經寫好，不用改。各個 feature 只透過 useShopApi() 拿到 API，不直接 fetch
// 正式環境由 main.ts 用 app.provide(SHOP_API, client) 提供真的 client；測試提供假的
import { inject, type InjectionKey } from 'vue'

export type Category = 'coffee' | 'tea' | 'food'
export type Product = { id: number; name: string; price: number; category: Category }
export type Size = 'M' | 'L'
export type Sugar = 'normal' | 'less' | 'none'
export type OrderStatus = 'received' | 'brewing' | 'ready'
export type OrderLine = { productId: number; name: string; size: Size; sugar: Sugar; qty: number; unitPrice: number }
export type Order = { id: number; storeId: number; customerId: number; status: OrderStatus; lines: OrderLine[] }
export type CheckoutInput = { phone: string; pickupTime: string; lines: OrderLine[] }

type Opts = { signal?: AbortSignal }

export type ShopApi = {
  /** 某個分類的菜單 */
  getMenu(category: Category, opts?: Opts): Promise<Product[]>
  /** 用關鍵字搜尋全部商品 */
  search(keyword: string, opts?: Opts): Promise<Product[]>
  /** 建立訂單；伺服器回 422 時丟 ValidationError，其他失敗丟一般的 Error */
  createOrder(input: CheckoutInput, idempotencyKey: string): Promise<{ id: number }>
  getOrder(id: number, opts?: Opts): Promise<Order>
}

// 第 16 課的 API 層把 422 轉成這個錯誤
export class ValidationError extends Error {
  readonly fieldErrors: Record<string, string[]>
  constructor(fieldErrors: Record<string, string[]>) {
    super('資料驗證失敗')
    this.name = 'ValidationError'
    this.fieldErrors = fieldErrors
  }
}

export const SHOP_API: InjectionKey<ShopApi> = Symbol('ShopApi')

export function useShopApi(): ShopApi {
  const api = inject(SHOP_API, null)
  if (!api) throw new Error('useShopApi() 找不到 SHOP_API：要先 provide(SHOP_API, client)')
  return api
}
