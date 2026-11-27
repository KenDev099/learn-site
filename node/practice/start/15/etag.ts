// 練習 1：ETag 的兩個小工具，練習 2、3 也會 import 它們

// 依內容算出 ETag：同樣的內容永遠得到同一個值，內容一變就不同；強 ETag 要用雙引號包起來
// 現在用時間戳記：內容沒變也會變，快取永遠用不上
export function etagOf(body: string | Buffer): string {
  return String(Date.now())
}

// 請求的 If-None-Match 標頭是否「命中」目前的 ETag（命中就回 304）
// 標頭可能是：沒有（undefined）、一個 ETag、用逗號分開的好幾個、*、或 W/ 開頭的弱 ETag
export function noneMatch(header: string | undefined, etag: string): boolean {
  return false
}
