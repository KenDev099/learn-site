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

function isLogLevel(s: string): s is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(s)
}

// env 由呼叫的人傳進來（main.ts 傳 process.env，測試傳自己做的物件），這裡面不要直接讀 process.env
export function loadConfig(env: Record<string, string | undefined>): Config {
  const errors: string[] = []

  const rawPort = env.PORT || '3000'
  const port = Number(rawPort)
  if (!/^\d+$/.test(rawPort) || port > 65535) errors.push(`PORT 要是 0–65535 的整數，收到 ${JSON.stringify(rawPort)}`)

  const shopName = env.SHOP_NAME?.trim() ?? ''
  if (shopName === '') errors.push('SHOP_NAME 必填')

  const rawLevel = env.LOG_LEVEL ?? 'info'
  const logLevel = isLogLevel(rawLevel) ? rawLevel : 'info'
  if (!isLogLevel(rawLevel)) errors.push(`LOG_LEVEL 要是 ${LOG_LEVELS.join('/')} 之一，收到 ${JSON.stringify(rawLevel)}`)

  const adminToken = env.ADMIN_TOKEN ?? ''
  if (adminToken.length < 16) errors.push(`ADMIN_TOKEN 必填，至少 16 個字元（目前 ${adminToken.length} 個）`)   // 只說長度，不印出 token

  if (errors.length > 0) throw new ConfigError(errors)
  return { port, shopName, logLevel, adminToken }
}
