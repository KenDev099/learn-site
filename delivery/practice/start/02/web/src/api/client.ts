// 所有 API 呼叫都經過這裡：開發時 /api 由 Vite 轉給 API（見 vite.config.ts）
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch('/api' + path, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(String(body?.message ?? `HTTP ${res.status}`))
  return body as T
}
