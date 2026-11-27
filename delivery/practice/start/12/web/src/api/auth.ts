import { api } from './client.ts'

// v2.8.0（SEC-7）：登入成功後 API 設定 HttpOnly 的 sid cookie，之後同網域的請求瀏覽器會自動帶上
export function login(username: string, password: string) {
  return api<{ role: 'customer' | 'staff', customerId: number | null }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}
