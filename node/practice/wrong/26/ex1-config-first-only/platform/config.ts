// 練習 1：讀設定
// 現在遇到第一個錯就回傳。改成檢查完全部、一次列出所有錯誤，讓部署的人改一次就好（第 2 課）
//   PORT                 0–65535 的整數，預設 3000
//   DATABASE_URL         必填，postgres:// 或 postgresql:// 開頭（錯誤訊息不要印出原本的值：裡面有密碼）
//   LOG_LEVEL            debug、info、warn、error 其中之一，預設 info
//   SUPPLIER_URL         必填，http:// 或 https:// 開頭；結尾的 / 去掉
//   SHUTDOWN_TIMEOUT_MS  1–600000 的整數，預設 10000
//   沒設和空字串都當成沒設
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
  const port = Number(env.PORT || 3000)
  if (!Number.isInteger(port) || port < 0 || port > 65535) return { ok: false, errors: ['PORT 要是 0 到 65535 的整數'] }

  const databaseUrl = env.DATABASE_URL ?? ''
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) return { ok: false, errors: ['DATABASE_URL 必填，格式是 postgres://使用者:密碼@主機:port/資料庫'] }

  const logLevel = env.LOG_LEVEL || 'info'
  if (!LOG_LEVELS.some(l => l === logLevel)) return { ok: false, errors: [`LOG_LEVEL 要是 ${LOG_LEVELS.join('、')} 其中之一`] }

  const supplierUrl = (env.SUPPLIER_URL ?? '').replace(/\/+$/, '')
  if (!URL.canParse(supplierUrl)) return { ok: false, errors: ['SUPPLIER_URL 必填，要是 http:// 或 https:// 開頭的網址'] }

  const shutdownTimeoutMs = Number(env.SHUTDOWN_TIMEOUT_MS || 10_000)

  return {
    ok: true,
    config: { port, databaseUrl, logLevel: logLevel as LogLevel, supplierUrl, shutdownTimeoutMs, enableTestRoutes: env.ENABLE_TEST_ROUTES === '1' },
  }
}
