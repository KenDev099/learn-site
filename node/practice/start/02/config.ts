// 練習 2：把環境變數轉成有型別的設定，一次列出所有問題
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type LogLevel = typeof LOG_LEVELS[number]
export type Config = { port: number, shopName: string, logLevel: LogLevel, adminToken: string }

export class ConfigError extends Error {
  errors: string[]
  constructor(errors: string[]) {
    super(`設定有 ${errors.length} 個問題：\n${errors.join('\n')}`)
    this.name = 'ConfigError'
    this.errors = errors
  }
}

// env 由呼叫的人傳進來（main.ts 傳 process.env，測試傳自己做的物件），這裡面不要直接讀 process.env
export function loadConfig(env: Record<string, string | undefined>): Config {
  // TODO：PORT 預設 3000，有給的話必須是 0–65535 的整數字串（"3000abc"、""、"3.5" 都不行）
  // TODO：SHOP_NAME 必填（空字串也算沒填）
  // TODO：LOG_LEVEL 是 LOG_LEVELS 之一，預設 info
  // TODO：ADMIN_TOKEN 必填，至少 16 個字元；錯誤訊息不要包含 token 本身
  // TODO：每個問題 push 一行訊息（開頭寫變數名稱），最後有問題就 throw new ConfigError(errors)
  throw new Error('loadConfig 還沒寫')
}
