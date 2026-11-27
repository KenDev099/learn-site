// 計算訂單金額：純函式，不碰資料庫，單元測試直接測它
export type Line = { price: number, quantity: number }

export function orderTotal(lines: Line[]): number {
  if (lines.length === 0) throw new Error('訂單至少要有一個品項')
  let total = 0
  for (const { price, quantity } of lines) {
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error(`數量要是正整數：${quantity}`)
    total += price * quantity
  }
  return total
}
