// 練習 1：把 SDK 丟出的錯誤分成「可以重試」「不要重試」「不是 API 的錯誤」
import Anthropic from '@anthropic-ai/sdk'

export type Verdict = 'retry' | 'fail' | 'unknown'

const RETRY_STATUS = [408, 409, 429]
const RETRY_STREAM_TYPES = ['overloaded_error', 'api_error']

// retry：429（RateLimitError）、5xx 與 529（InternalServerError）、408、409、連線錯誤與逾時（APIConnectionError，含 APIConnectionTimeoutError）、
//        串流中途的 error 事件（APIError，status 是 undefined，type 是 'overloaded_error' 或 'api_error'）
// fail：使用者中斷（APIUserAbortError）、400、401、403、404 這類請求本身有問題的錯誤、其他 type 的串流中途錯誤
// unknown：不是 SDK 的錯誤（你自己的 bug、TypeError、字串…）
// 用 instanceof、.status、.type 判斷，不要比對錯誤訊息
export function classify(err: unknown): Verdict {
  // 子類別先判斷：這兩個也都是 APIError，status 都是 undefined
  if (err instanceof Anthropic.APIUserAbortError) return 'fail'
  if (err instanceof Anthropic.APIConnectionError) return 'retry'
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) return 'retry'
  if (err instanceof Anthropic.APIError) {
    if (err.status === undefined) return RETRY_STREAM_TYPES.includes(err.type ?? '') ? 'retry' : 'fail'
    return 'fail'   // 只認 RateLimitError、InternalServerError，漏了 408、409
  }
  return 'unknown'
}
