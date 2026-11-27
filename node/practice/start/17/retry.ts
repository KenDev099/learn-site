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

export async function withRetry<T>(fn: () => Promise<T>, { retries, baseMs, maxMs, deadlineMs, random = Math.random }: RetryOptions): Promise<T> {
  // TODO：只重試暫時性的錯誤、指數退避加 full jitter、Retry-After、次數上限、截止時間
  return fn()
}

// 查庫存，暫時性的失敗最多再試 3 次：baseMs 100、maxMs 1000、整件事最多 5 秒
export function getStockWithRetry(baseUrl: string, productId: number): Promise<Stock> {
  return getStock(baseUrl, productId)
}
