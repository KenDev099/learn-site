import { ApiErrorBody } from '../../../shared/contract.ts'

// API 回的錯誤：除了訊息，也留下狀態碼和 code（例如 409 的 SLOT_FULL），畫面才能分辨要怎麼處理
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
  }
}

// 所有 API 呼叫都經過這裡：開發時 /api 由 Vite 轉給 API（見 vite.config.ts）
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch('/api' + path, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    // 錯誤的 body 也照契約讀；不符合（例如 Proxy 回的 502 HTML）就只用狀態碼
    const err = ApiErrorBody.safeParse(body)
    throw err.success ? new ApiError(err.data.message, res.status, err.data.code) : new ApiError(`HTTP ${res.status}`, res.status)
  }
  return body as T
}
