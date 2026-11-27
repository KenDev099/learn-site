// 練習 2：重試
import { UpstreamHttpError, UpstreamTimeoutError, UpstreamUnavailableError } from './errors.ts'
import { getStock, type Stock } from './supplier.ts'

export type RetryOptions = {
  retries: number                 // 第一次失敗之後最多再試幾次
  baseMs: number                  // 第 1 次重試前等待的上限
  maxMs: number                   // 每次等待的上限
  deadlineMs: number              // 從第一次呼叫開始，整件事最多花多久
  random?: () => number           // 0 ≤ x < 1，測試會傳入固定值
}

const RETRY_STATUS = new Set([429, 502, 503, 504])

function isRetryable(err: unknown) {
  if (err instanceof UpstreamUnavailableError || err instanceof UpstreamTimeoutError) return true
  return err instanceof UpstreamHttpError && RETRY_STATUS.has(err.status)
}

// Retry-After 可以是秒數或 HTTP 日期；看不懂就當沒有
function retryAfterMs(err: unknown) {
  if (!(err instanceof UpstreamHttpError) || (err.status !== 429 && err.status !== 503) || !err.retryAfter) return 0
  if (/^\d+$/.test(err.retryAfter)) return Number(err.retryAfter) * 1000
  const at = Date.parse(err.retryAfter)
  return Number.isNaN(at) ? 0 : Math.max(0, at - Date.now())
}

export async function withRetry<T>(fn: () => Promise<T>, { retries, baseMs, maxMs, deadlineMs, random = Math.random }: RetryOptions): Promise<T> {
  const started = Date.now()
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!isRetryable(err) || attempt >= retries) throw err
      const backoff = random() * Math.min(maxMs, baseMs * 2 ** attempt)   // full jitter
      const wait = Math.max(backoff, retryAfterMs(err))
      await new Promise(r => setTimeout(r, wait))
    }
  }
}

// 查庫存，暫時性的失敗最多再試 3 次：baseMs 100、maxMs 1000、整件事最多 5 秒
export function getStockWithRetry(baseUrl: string, productId: number): Promise<Stock> {
  return withRetry(() => getStock(baseUrl, productId), { retries: 3, baseMs: 100, maxMs: 1000, deadlineMs: 5000 })
}
