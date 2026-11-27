// 練習 1：讀設定。所有錯誤一次列出來，讓部署的人改一次就好（第 2 課）
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type Config = {
  port: number
  databaseUrl: string
  logLevel: LogLevel
  supplierUrl: string        // 結尾沒有 /
  shutdownTimeoutMs: number
  enableTestRoutes: boolean  // ENABLE_TEST_ROUTES=1 才開，只給測試用
}
export type ConfigResult = { ok: true, config: Config } | { ok: false, errors: string[] }

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

export function loadConfig(env: NodeJS.ProcessEnv): ConfigResult {
  const errors: string[] = []

  // 沒設（或空字串）用預設值；有設就一定要是範圍內的整數
  const int = (name: string, fallback: number, min: number, max: number) => {
    const raw = env[name]
    if (raw === undefined || raw === '') return fallback
    if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) {
      errors.push(`${name} 要是 ${min} 到 ${max} 的整數，收到 ${JSON.stringify(raw)}`)
      return fallback
    }
    return Number(raw)
  }
  const port = int('PORT', 3000, 0, 65535)
  const shutdownTimeoutMs = int('SHUTDOWN_TIMEOUT_MS', 10_000, 1, 600_000)

  const databaseUrl = env.DATABASE_URL ?? ''
  // 錯誤訊息不印出 DATABASE_URL 本身：裡面有密碼，而 stderr 會進 log
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) errors.push('DATABASE_URL 必填，格式是 postgres://使用者:密碼@主機:port/資料庫')

  const logLevel = env.LOG_LEVEL || 'info'
  if (!LOG_LEVELS.some(l => l === logLevel)) errors.push(`LOG_LEVEL 要是 ${LOG_LEVELS.join('、')} 其中之一，收到 ${JSON.stringify(logLevel)}`)

  const supplierUrl = (env.SUPPLIER_URL ?? '').replace(/\/+$/, '')
  if (!URL.canParse(supplierUrl) || !['http:', 'https:'].includes(new URL(supplierUrl).protocol)) {
    errors.push('SUPPLIER_URL 必填，要是 http:// 或 https:// 開頭的網址')
  }

  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    config: { port, databaseUrl, logLevel: logLevel as LogLevel, supplierUrl, shutdownTimeoutMs, enableTestRoutes: env.ENABLE_TEST_ROUTES === '1' },
  }
}
