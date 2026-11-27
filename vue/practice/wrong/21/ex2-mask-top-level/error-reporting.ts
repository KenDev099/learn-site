// 練習 2：集中回報錯誤 installErrorReporting
// 問題：正式環境的錯誤只印在客人的 console，工程師看不到；好不容易接上監控之後，
//       回報裡夾著 accessToken 和客人的手機號碼，同一個錯誤一分鐘送了幾千次。
// 要求：installErrorReporting(app, options) 設定好錯誤回報，回傳一個移除監聽的函式
//   1. 設定 app.config.errorHandler：Vue 元件的錯誤都要回報，info 用 Vue 給的 info
//   2. 在 options.target（正式環境是 window，測試傳入假的 EventTarget）監聽：
//      - unhandledrejection：錯誤是 event.reason，info 是 'unhandledrejection'
//      - error（例如 setTimeout 的 callback 丟錯）：錯誤是 event.error，info 是 'window error'
//   3. 每次回報呼叫 report({ message, stack, info, route, release, context })
//      - message、stack：從錯誤取出；丟出的不是 Error 時 message 是 String(值)、stack 是 ''
//      - route 是 getRoute() 的回傳值，release 是 options.release，context 是 getContext() 的回傳值
//   4. context 裡名稱含 token、password、phone 的欄位（不分大小寫，巢狀物件也算）改成 '[已遮罩]'，
//      其他欄位照原樣；不能改到 getContext() 回傳的原物件
//   5. 去重：同一個 message＋stack 在 60 秒內只回報一次（時間用 options.now()），超過 60 秒再發生要再回報
//   6. 回傳的函式：移除 target 上的兩個監聽
import type { App } from 'vue'

export type ErrorReport = {
  message: string
  stack: string
  info: string
  route: string
  release: string
  context: Record<string, unknown>
}

export type ReportingOptions = {
  report: (payload: ErrorReport) => void
  release: string
  getRoute: () => string
  getContext: () => Record<string, unknown>
  now: () => number
  target: EventTarget
}

const SENSITIVE = /token|password|phone/i
const DEDUPE_MS = 60_000

function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mask)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, SENSITIVE.test(key) ? '[已遮罩]' : v]),
    )
  }
  return value
}

export function installErrorReporting(app: App, options: ReportingOptions): () => void {
  const lastSent = new Map<string, number>()

  function send(err: unknown, info: string) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? (err.stack ?? '') : ''
    const key = `${message}\n${stack}`
    const t = options.now()
    const last = lastSent.get(key)
    if (last !== undefined && t - last < DEDUPE_MS) return
    lastSent.set(key, t)
    options.report({
      message,
      stack,
      info,
      route: options.getRoute(),
      release: options.release,
      context: mask(options.getContext()) as Record<string, unknown>,
    })
  }

  app.config.errorHandler = (err, _instance, info) => send(err, info)
  const onRejection = (e: Event) => send((e as PromiseRejectionEvent).reason, 'unhandledrejection')
  const onError = (e: Event) => send((e as ErrorEvent).error, 'window error')
  options.target.addEventListener('unhandledrejection', onRejection)
  options.target.addEventListener('error', onError)

  return () => {
    options.target.removeEventListener('unhandledrejection', onRejection)
    options.target.removeEventListener('error', onError)
  }
}
