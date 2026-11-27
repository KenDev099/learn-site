// 練習 2：業務驗證：商品有沒有在賣、庫存夠不夠，價格一律用菜單上的
import type { OrderIntent } from './ex1.ts'

export type MenuItem = { name: string; price: number; available: boolean }   // price 是整數（元）
export type Line = { product: string; quantity: number; unitPrice: number; subtotal: number }
export type OrderResult =
  | { ok: true; lines: Line[]; total: number }
  | { ok: false; errors: string[] }

// intent 不是 'order'：回傳 ok: false（說明不是訂單）
// 同一個商品出現好幾次：數量合併成一行（依第一次出現的順序）
// 每個商品：不在 menu 或 available 是 false → 錯誤訊息要包含商品名稱；stock 裡的數量不夠（沒有這個 key 當成 0）→ 錯誤訊息要包含商品名稱
// 所有錯誤都列出來，不是遇到第一個就停；沒有錯誤時回傳每一行與 total（unitPrice 用 menu 的 price）
export function toOrder(intent: OrderIntent, menu: MenuItem[], stock: Record<string, number>): OrderResult {
  throw new Error('TODO')
}
