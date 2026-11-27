// 練習 3：伺服器端（例如 Nuxt 的 server route、Express handler）判斷「這個請求是誰」
// 瀏覽器用 @supabase/ssr 登入後，session 存在 cookie（sb-<專案代號>-auth-token），每個請求都會帶上
import { createServerClient, parseCookieHeader } from '@supabase/ssr'
import type { Config } from './harness.ts'

// GET /api/me：已登入回 200 { userId, email }；沒登入或 token 不可信回 401 { error }
export async function handleMe(req: Request, cfg: Config): Promise<Response> {
  // 1. 用 createServerClient 建 client：cookies.getAll 從 req 的 cookie header 讀（parseCookieHeader），setAll 先不用處理
  // 2. 取得「驗過簽章」的使用者身分，不能只讀 cookie 裡存的內容
  // 3. 回傳 Response.json(…, { status })
  return Response.json({ error: '還沒寫' }, { status: 500 })
}
