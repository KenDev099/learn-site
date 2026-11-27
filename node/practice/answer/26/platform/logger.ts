// 結構化 logger（第 19 課）：每次輸出一行 JSON
// 練習 6：輸出前把完整的手機號碼遮掉
export type Level = 'debug' | 'info' | 'warn' | 'error' | 'fatal'
export type Fields = Record<string, unknown>
export type LogFn = (msg: string, fields?: Fields) => void
export type Logger = {
  debug: LogFn, info: LogFn, warn: LogFn, error: LogFn, fatal: LogFn,
  child(bindings: Fields): Logger,
}
export type LoggerOptions = {
  level?: Level
  write?: (line: string) => void   // 收到一整行（結尾有 \n），預設寫到 stdout
}

const LEVELS: Record<Level, number> = { debug: 20, info: 30, warn: 40, error: 50, fatal: 60 }
const SECRET_KEYS = new Set(['password', 'token', 'authorization', 'cookie', 'cardnumber'])

// 台灣手機號碼：09 開頭共 10 碼，中間可能有 - 或空白
const PHONE = /\b09\d{2}[- ]?\d{3}[- ]?\d{3}\b/g
// 0912-345-678 → 0912*****678：留頭尾，客服還對得上是哪支電話，但 log 外流時不是完整的個資
const maskPhones = (line: string) => line.replace(PHONE, p => p.slice(0, 4) + '*'.repeat(p.length - 7) + p.slice(-3))

function serializeError(err: Error): Fields {
  const out: Fields = { name: err.name, message: err.message, stack: err.stack }
  const { code, detail } = err as { code?: unknown, detail?: unknown }
  if (code !== undefined) out.code = code
  if (detail !== undefined) out.detail = detail   // pg 的錯誤把「哪一筆資料衝突」放在 detail
  if (err.cause !== undefined) out.cause = err.cause
  return out
}

function safeReplacer() {
  const ancestors: unknown[] = []
  return function (this: unknown, key: string, value: unknown) {
    if (SECRET_KEYS.has(key.toLowerCase())) return '[REDACTED]'
    if (typeof value === 'bigint') return value.toString()
    if (typeof value !== 'object' || value === null) return value
    while (ancestors.length > 0 && ancestors.at(-1) !== this) ancestors.pop()
    if (ancestors.includes(value)) return '[Circular]'
    ancestors.push(value)
    if (!(value instanceof Error)) return value
    const out = serializeError(value)
    ancestors.push(out)
    return out
  }
}

export function createLogger({ level = 'info', write = line => { process.stdout.write(line) } }: LoggerOptions = {}): Logger {
  const min = LEVELS[level]
  const make = (bindings: Fields): Logger => {
    const log = (lv: Level): LogFn => (msg, fields = {}) => {
      if (LEVELS[lv] < min) return
      const entry = { time: new Date().toISOString(), level: lv, msg, ...bindings, ...fields }
      // 在整行字串上遮：電話可能藏在錯誤訊息、stack、pg 的 detail 裡，不只在叫 phone 的欄位
      write(maskPhones(JSON.stringify(entry, safeReplacer())) + '\n')
    }
    return {
      debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error'), fatal: log('fatal'),
      child: more => make({ ...bindings, ...more }),
    }
  }
  return make({})
}
