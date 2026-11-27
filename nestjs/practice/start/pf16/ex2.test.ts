// 練習 2：錯誤回應 body 的 requestId 等於回應標頭的 x-request-id
import { call, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 2：錯誤回應的 requestId', () => {
  it('400、401、404、壞掉的 JSON：body.requestId 等於 x-request-id 標頭', async () => {
    const a = await signupTenant(t)
    const cases = {
      '400 驗證失敗': await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: '' } }),
      '401 沒登入': await call(t, 'GET', '/api/v1/me'),
      '404 別人的 project': await call(t, 'GET', '/api/v1/projects/00000000-0000-4000-8000-000000000000', { token: a.token }),
      '400 壞掉的 JSON': await call(t, 'POST', '/api/v1/auth/login', { raw: '{"email":', headers: { 'content-type': 'application/json' } }),
    }
    for (const [what, r] of Object.entries(cases)) {
      expect(r.status, `${what}：狀態碼 ${r.status}：${r.text.slice(0, 200)}`).toBeGreaterThanOrEqual(400)
      expect(r.body?.requestId, `${what}：錯誤回應的 requestId 是「${r.body?.requestId}」，標頭是「${r.headers.get('x-request-id')}」。兩個要是同一個值：使用者回報錯誤時給的 requestId，要能在 log 裡找到同一個請求。exception filter 從請求上下文或回應標頭拿，不要自己再產生`).toBe(r.headers.get('x-request-id'))
    }
  })

  it('沿用的 id 也出現在錯誤 body', async () => {
    const r = await call(t, 'GET', '/api/v1/me', { headers: { 'x-request-id': 'support-ticket-42' } })
    expect(r.body?.requestId, '送 x-request-id: support-ticket-42 的 401，body.requestId 也要是它').toBe('support-ticket-42')
  })
})
