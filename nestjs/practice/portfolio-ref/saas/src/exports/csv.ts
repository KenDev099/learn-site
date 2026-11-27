// CSV 的一格：有逗號、雙引號、換行就用雙引號包起來（裡面的雙引號寫兩次）；
// 開頭是 = + - @ Tab CR 的，前面加 '：不然用試算表打開時會被當成公式執行（CSV injection，第 13 課）
export function cell(value: unknown) {
  let s = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const csv = (header: string[], rows: unknown[][]) => [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n'
