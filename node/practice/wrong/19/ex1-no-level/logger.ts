// 練習 1：結構化 logger
// 每次輸出一行 JSON：{"time":"…","level":"info","msg":"…",…bindings,…fields}
export type Level = 'debug' | 'info' | 'warn' | 'error' | 'fatal'
export type Fields = Record<string, unknown>
export type LogFn = (msg: string, fields?: Fields) => void
export type Logger = {
  debug: LogFn, info: LogFn, warn: LogFn, error: LogFn, fatal: LogFn,
  child(bindings: Fields): Logger,
}
export type LoggerOptions = {
  level?: Level                    // 低於這個等級的不輸出，預設 info
  write?: (line: string) => void   // 收到一整行（結尾有 \n），預設寫到 stdout
  now?: () => Date                 // 測試會傳固定的時間
}

const LEVELS: Record<Level, number> = { debug: 20, info: 30, warn: 40, error: 50, fatal: 60 }
const SECRET_KEYS = new Set(['password', 'token', 'authorization', 'cookie', 'cardnumber'])

function serializeError(err: Error): Fields {
  const out: Fields = { name: err.name, message: err.message, stack: err.stack }
  const code = (err as { code?: unknown }).code
  if (code !== undefined) out.code = code
  if (err.cause !== undefined) out.cause = err.cause   // cause 是 Error 時，replacer 會再處理它
  return out
}

// JSON.stringify 的 replacer：每個值輸出前都會經過這裡，key 是欄位名稱，this 是裝著這個值的物件
function safeReplacer() {
  const ancestors: unknown[] = []   // 從最外層到目前這個值的「祖先」
  return function (this: unknown, key: string, value: unknown) {
    if (SECRET_KEYS.has(key.toLowerCase())) return '[REDACTED]'
    if (typeof value === 'bigint') return value.toString()
    if (typeof value !== 'object' || value === null) return value
    // 回到上一層時，把已經離開的祖先拿掉：只有「自己包含自己」才算循環，同一個物件出現兩次不算
    while (ancestors.length > 0 && ancestors.at(-1) !== this) ancestors.pop()
    if (ancestors.includes(value)) return '[Circular]'
    ancestors.push(value)
    if (!(value instanceof Error)) return value
    const out = serializeError(value)
    ancestors.push(out)
    return out
  }
}

export function createLogger({
  level = 'info',
  write = line => { process.stdout.write(line) },
  now = () => new Date(),
}: LoggerOptions = {}): Logger {
  const min = LEVELS[level]
  const make = (bindings: Fields): Logger => {
    const log = (lv: Level): LogFn => (msg, fields = {}) => {
      const entry = { time: now().toISOString(), level: lv, msg, ...bindings, ...fields }
      write(JSON.stringify(entry, safeReplacer()) + '\n')
    }
    return {
      debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error'), fatal: log('fatal'),
      child: more => make({ ...bindings, ...more }),
    }
  }
  return make({})
}
