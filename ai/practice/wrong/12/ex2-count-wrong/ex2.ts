// 練習 2：送給模型、寫進 log 之前，先遮蔽個資

export type PiiKind = 'phone' | 'email' | 'card'
export type Redacted = { text: string; found: Record<PiiKind, number> }

// 台灣手機：09 開頭共 10 碼，可以寫成 0912345678、0912-345-678、0912 345 678 → [電話]
// Email → [Email]
// 卡號：13～19 碼數字，中間可以有空白或 -，而且要通過 Luhn 檢查 → [卡號]；不通過的（例如 16 碼的訂單編號）保持原樣
// found 是各類被換掉的次數，三個 key 都要有（沒有就是 0）
// 提示：先處理卡號（最長的數字串），再處理電話；數字串前後用 (?<!\d)、(?!\d) 避免切到更長的數字中間
// Luhn：從最右邊算起，每隔一位乘 2（大於 9 就減 9），全部加起來是 10 的倍數才通過
function luhn(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

export function redactPII(text: string): Redacted {
  const found: Record<PiiKind, number> = { phone: 0, email: 0, card: 0 }
  const out = text
    .replace(/(?<!\d[ -]?)\d(?:[ -]?\d){12,18}(?![ -]?\d)/g, m => {
      if (!luhn(m.replace(/\D/g, ''))) return m
      found.card++
      return '[卡號]'
    })
    .replace(/(?<!\d)09\d{2}[ -]?\d{3}[ -]?\d{3}(?!\d)/g, () => {
      found.phone++
      return '[電話]'
    })
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, () => {
      found.phone++
      return '[Email]'
    })
  return { text: out, found }
}
