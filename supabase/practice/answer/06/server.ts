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
  // getClaims 驗過 access token 的簽章（本機與新專案是非對稱金鑰，在這台伺服器上就能驗）才回傳內容
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data) return Response.json({ error: '請先登入' }, { status: 401 })
  return Response.json({ userId: data.claims.sub, email: data.claims.email })
}
