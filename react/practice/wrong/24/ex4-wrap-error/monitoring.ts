/*
練習 4：把錯誤接到監控：createRoot 的三個錯誤選項，加上 window 的兩個事件
問題：
  咖啡店線上點餐上線後，客服說「有客人看到『這個區塊暫時無法顯示』」，工程師卻什麼都查不到：
  沒有任何錯誤被送到監控。
要求：
  1. rootErrorOptions(reporter) 回傳給 createRoot／hydrateRoot 的選項：
     onCaughtError → reporter.capture(error instanceof Error ? error : new Error(String(error)), { source: 'caught', componentStack })
     onUncaughtError → source 'uncaught'；onRecoverableError → source 'recoverable'
     error 照原樣交出去（丟出字串就交字串，不要包成別的東西）；componentStack 用 React 給的 errorInfo.componentStack
  2. listenGlobalErrors(target, reporter) 在 target 上監聽：
     'error' → capture(event.error, { source: 'window' })；
       跨網域的 script 出錯時 event.error 是 null，改交 event.message（例如 "Script error."）
     'unhandledrejection' → capture(event.reason, { source: 'promise' })
  3. listenGlobalErrors 回傳一個函式，呼叫後兩個監聽都要移除
  4. 同一個錯誤只回報一次：render 時沒人攔的錯誤交給 onUncaughtError 之後，不能再從 window 的 error 事件送一次
*/
import type { RootOptions } from 'react-dom/client'
import type { Reporter } from './reporter.ts'

export type ErrorOptions = Pick<RootOptions, 'onCaughtError' | 'onUncaughtError' | 'onRecoverableError'>

export function rootErrorOptions(reporter: Reporter): ErrorOptions {
  return {
    onCaughtError: (error, info) => reporter.capture(error instanceof Error ? error : new Error(String(error)), { source: 'caught', componentStack: info.componentStack }),
    onUncaughtError: (error, info) => reporter.capture(error, { source: 'uncaught', componentStack: info.componentStack }),
    onRecoverableError: (error, info) => reporter.capture(error, { source: 'recoverable', componentStack: info.componentStack }),
  }
}

export function listenGlobalErrors(target: Window, reporter: Reporter): () => void {
  const onError = (event: ErrorEvent) => reporter.capture(event.error ?? event.message, { source: 'window' })
  const onRejection = (event: PromiseRejectionEvent) => reporter.capture(event.reason, { source: 'promise' })
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
  }
}
