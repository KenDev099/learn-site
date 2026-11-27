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
  if (!res.ok) throw new ApiError(String(body?.message ?? `HTTP ${res.status}`), res.status, body?.code)
  return body as T
}
