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
  if (intent.intent !== 'order') return { ok: false, errors: [`這不是訂單（intent: ${intent.intent}）`] }
  if (intent.items.length === 0) return { ok: false, errors: ['訂單沒有任何品項'] }

  // 同一個商品合併成一行，庫存才會用總數量檢查
  const quantities = new Map<string, number>()
  for (const item of intent.items) quantities.set(item.product, (quantities.get(item.product) ?? 0) + item.quantity)

  const errors: string[] = []
  const lines: Line[] = []
  for (const [product, quantity] of quantities) {
    const menuItem = menu.find(m => m.name === product)
    if (!menuItem) {
      errors.push(`${product} 目前沒有供應`)
      continue
    }
    const left = stock[product] ?? 0
    if (left < quantity) errors.push(`${product} 庫存不足：要 ${quantity}，剩 ${left}`)
    // 價格只看菜單；模型輸出裡就算多了 price 欄位也不用
    lines.push({ product, quantity, unitPrice: menuItem.price, subtotal: menuItem.price * quantity })
  }
  if (errors.length) return { ok: false, errors }
  return { ok: true, lines, total: lines.reduce((sum, l) => sum + l.subtotal, 0) }
}
