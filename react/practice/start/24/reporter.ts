// 監控服務的替身。正式環境換成 Sentry 這類服務的 SDK：release、匿名使用者 id、取樣、遮罩個資
// 都在建立 reporter 時設定一次，呼叫的地方只負責交出錯誤和「從哪裡來」。這個檔案不用改
export type ErrorSource =
  | 'caught'       // 被 Error Boundary 攔下（createRoot 的 onCaughtError）
  | 'uncaught'     // 沒有 Error Boundary 攔（onUncaughtError）
  | 'recoverable'  // React 自己恢復了（onRecoverableError，例如 hydration 不一致）
  | 'window'       // window 的 error 事件：事件處理函式、計時器裡丟的錯
  | 'promise'      // window 的 unhandledrejection 事件：沒有人接的 Promise 失敗
  | 'handler'      // 自己 catch 到、判斷是預期外的錯誤

export type ErrorContext = {
  source: ErrorSource
  /** React 給的元件堆疊（errorInfo.componentStack），其他來源沒有 */
  componentStack?: string
}

export type Reporter = {
  capture(error: unknown, context: ErrorContext): void
}
