import { readFileSync } from 'node:fs'

// 啟動時讀取並驗證設定（node 課第 2 課的 fail fast）：少了什麼就印出來並以 exit 1 結束
const ENVS = ['development', 'staging', 'production']
const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']

// 讀一個機密。練習 2：如果有 <name>_FILE（例如 DB_PASSWORD_FILE=/run/secrets/db_password），改從那個檔案讀
function secret(name: string): string | undefined {
  const file = process.env[`${name}_FILE`]
  // 檔案結尾的換行不是密碼的一部分（postgres 映像讀 _FILE 時也會去掉）
  if (file) return readFileSync(file, 'utf8')
  return process.env[name]
}

export function loadConfig() {
  const problems: string[] = []
  const need = (name: string) => {
    const value = process.env[name]
    if (!value) problems.push(`缺少 ${name}`)
    return value ?? ''
  }
  const config = {
    appEnv: need('APP_ENV'),
    logLevel: process.env.LOG_LEVEL || 'info',
    featureLoyalty: process.env.FEATURE_LOYALTY === 'true',
    db: { host: need('DB_HOST'), user: need('DB_USER'), database: need('DB_NAME'), password: secret('DB_PASSWORD') ?? '' },
  }
  if (!config.db.password) problems.push('缺少 DB_PASSWORD（或 DB_PASSWORD_FILE）')
  if (config.appEnv && !ENVS.includes(config.appEnv)) problems.push(`APP_ENV 只能是 ${ENVS.join('、')}，收到 ${config.appEnv}`)
  if (!LEVELS.includes(config.logLevel)) problems.push(`LOG_LEVEL 只能是 ${LEVELS.join('、')}，收到 ${config.logLevel}`)
  if (problems.length) {
    console.error(`設定有誤，無法啟動：\n- ${problems.join('\n- ')}`)
    process.exit(1)
  }
  return config
}
