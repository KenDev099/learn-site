// 練習 2：送給模型、寫進 log 之前，先遮蔽個資

export type PiiKind = 'phone' | 'email' | 'card'
export type Redacted = { text: string; found: Record<PiiKind, number> }

// 台灣手機：09 開頭共 10 碼，可以寫成 0912345678、0912-345-678、0912 345 678 → [電話]
// Email → [Email]
// 卡號：13～19 碼數字，中間可以有空白或 -，而且要通過 Luhn 檢查 → [卡號]；不通過的（例如 16 碼的訂單編號）保持原樣
// found 是各類被換掉的次數，三個 key 都要有（沒有就是 0）
// 提示：先處理卡號（最長的數字串），再處理電話；數字串前後加 (?<!\d)、(?!\d) 這類 lookbehind／lookahead，避免從更長的數字中間切一段出來
export function redactPII(text: string): Redacted {
  throw new Error('TODO')
}
