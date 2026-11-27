// 計算訂單金額（這一題不用改這個檔案，你要為它寫測試）
export type Item = { name: string, price: number, qty: number }

// 規則：
// 1. 小計 = 單價 × 數量，全部加總
// 2. 數量必須是正整數（1、2、3…），否則丟出 RangeError
// 3. 優惠碼 LATTE10（不分大小寫）打九折
// 4. 打折之後的金額 ≥ 300，再折 30
// 5. 最後四捨五入到整數
export function calcOrderTotal(items: Item[], coupon?: string): number {
  let total = 0
  for (const { price, qty } of items) {
    if (!Number.isInteger(qty) || qty <= 0) throw new RangeError(`數量要是正整數，收到 ${qty}`)
    total += price * qty
  }
  if (coupon?.toUpperCase() === 'LATTE10') total *= 0.9
  if (total >= 300) total -= 30
  return Math.round(total)
}
