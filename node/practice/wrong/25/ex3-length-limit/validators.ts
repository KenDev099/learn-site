// 練習 3：這兩個驗證規則遇到特定輸入會指數回溯（ReDoS），一個請求就能卡住整個伺服器
// 改寫成語意完全相同、不會卡住的版本：哪些字串合法、哪些不合法都不能變

// 優惠碼：英文大寫或數字組成的一段或多段，段與段之間用一個 - 連接
// 合法：LATTE、LATTE-2026、A-B-C；不合法：-LATTE、LATTE-、LATTE--2026、latte
const COUPON = /^([A-Z0-9]+-?)*[A-Z0-9]+$/

export function validateCouponCode(code: string): boolean {
  if (code.length > 10_000) return false
  return COUPON.test(code)
}

// 飲料備註：一個或多個選項，用逗號分開（逗號前後可以有空白）
// 每個選項是一個或多個「字」（字母、中文、數字），字之間用一個半形空白分開
// 合法：'少冰'、'少冰,半糖'、'少冰 , 半糖, extra shot'；不合法：'少冰,'、' 少冰'、'少冰  半糖'、'少冰!'
const NOTE = /^([\p{L}\p{N}]+ ?)*[\p{L}\p{N}]+(\s*,\s*([\p{L}\p{N}]+ ?)*[\p{L}\p{N}]+)*$/u

// 合法時回傳每個選項（去掉前後空白），不合法回傳 null
export function parseDrinkNote(note: string): string[] | null {
  if (note.length > 10_000 || !NOTE.test(note)) return null
  return note.split(',').map(s => s.trim())
}
