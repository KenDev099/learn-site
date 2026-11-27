// 練習 3：伺服器端（例如 Nuxt 的 server route、Express handler）判斷「這個請求是誰」
// 瀏覽器用 @supabase/ssr 登入後，session 存在 cookie（sb-<專案代號>-auth-token），每個請求都會帶上
import { createServerClient, parseCookieHeader } from '@supabase/ssr'
import type { Config } from './harness.ts'

// GET /api/me：已登入回 200 { userId, email }；沒登入或 token 不可信回 401 { error }
export async function handleMe(req: Request, cfg: Config): Promise<Response> {
  const supabase = createServerClient(cfg.url, cfg.publishableKey, {
    cookies: {
      getAll: () => parseCookieHeader(req.headers.get('cookie') ?? '').map(c => ({ name: c.name, value: c.value ?? '' })),
      setAll: () => {},   // 真的 handler 要把 refresh 後的新 cookie 寫回 response（Set-Cookie）
    },
  })
  // 用 getSession 的 user：只是讀出 cookie 的內容，沒驗簽章
  const { data } = await supabase.auth.getSession()
  if (!data.session) return Response.json({ error: '請先登入' }, { status: 401 })
  return Response.json({ userId: data.session.user.id, email: data.session.user.email })
}
