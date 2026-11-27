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

export function createLogger({
  level = 'info',
  write = line => { process.stdout.write(line) },
  now = () => new Date(),
}: LoggerOptions = {}): Logger {
  // TODO：等級過濾、child、Error 序列化（含 cause、code）、遮蔽敏感欄位、循環參照
  const log = (lv: Level): LogFn => (msg, fields = {}) => {
    write(JSON.stringify({ time: now().toISOString(), level: lv, msg, ...fields }) + '\n')
  }
  return {
    debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error'), fatal: log('fatal'),
    child: () => { throw new Error('child 還沒寫') },
  }
}
