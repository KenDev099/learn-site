// 練習 2：啟動時驗證設定 loadConfig(env)
// 問題：部署時忘了設 VITE_API_BASE_URL，app 照樣啟動，每個請求都打到 "undefined/menu"，
//       使用者只看到「菜單載入失敗」；有人把付款密鑰寫成 VITE_PAYMENT_SECRET，它被打包進前端，誰都看得到。
// 要求（env 在正式環境是 import.meta.env，測試直接傳物件進來）：
//   1. VITE_API_BASE_URL 必填。用 new URL() 解析：必須是 https:，或是 http: 而且 hostname 是 localhost
//      （不能用 startsWith 判斷字串：http://localhost.evil.com、http://localhost@evil.com 都不是 localhost）
//      回傳的 apiBaseUrl 去掉結尾的 /
//   2. VITE_FEATURE_FLAGS 選填：逗號分隔，去掉空白和空字串，轉成 Set；沒有就是空的 Set
//   3. 名稱以 VITE_ 開頭、又含 SECRET、PASSWORD 或 PRIVATE（不分大小寫）的變數要報錯：它們會被打包進前端
//   4. 有任何問題就丟出 ConfigError，problems 一次列出所有問題（每個問題的文字要包含變數名稱），不要只報第一個
export type AppConfig = { apiBaseUrl: string; featureFlags: Set<string> }

export class ConfigError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super('設定有誤：\n' + problems.map(p => '- ' + p).join('\n'))
    this.name = 'ConfigError'
    this.problems = problems
  }
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  return { apiBaseUrl: env.VITE_API_BASE_URL ?? '', featureFlags: new Set() }
}
