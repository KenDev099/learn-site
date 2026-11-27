// 練習 3：壞掉、偽造的 access token 一律 401；refresh cookie 的屬性
import { createHmac } from 'node:crypto'
import { call, PASSWORD, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')

describe('練習 3：token 驗證與 cookie', () => {
  it('沒有 token、亂碼、alg: none、別的金鑰簽的、被改過內容的：GET /me 都 401', async () => {
    const a = await signupTenant(t)
    const [h, p, s] = a.token.split('.')
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString())
    const cases: [string, string | undefined][] = [
      ['沒有 token', undefined],
      ['亂碼', 'not-a-jwt'],
      ['alg: none（沒有簽章）', `${b64({ alg: 'none', typ: 'JWT' })}.${p}.`],
      ['別的金鑰簽的', `${h}.${p}.${createHmac('sha256', 'attacker-secret-attacker-secret!!').update(`${h}.${p}`).digest('base64url')}`],
      ['改了 payload、沿用原本的簽章', `${h}.${b64({ ...payload, sub: '00000000-0000-4000-8000-000000000000' })}.${s}`],
    ]
    const wrong: string[] = []
    for (const [what, token] of cases) {
      const r = await call(t, 'GET', '/api/v1/me', { token })
      if (r.status !== 401) wrong.push(`${what} → ${r.status}`)
    }
    expect(wrong, `這些 token 要 401：verify 要檢查簽章、寫死演算法（algorithms: ['HS256']），不能只 decode`).toEqual([])
  })

  it('refresh cookie：HttpOnly、SameSite、Path=/api/v1/auth', async () => {
    const a = await signupTenant(t)
    const res = await call(t, 'POST', '/api/v1/auth/login', { body: { email: a.email, password: PASSWORD } })
    const set = res.headers.getSetCookie()
    expect(set.length, '登入要用 Set-Cookie 設 refresh token').toBeGreaterThan(0)
    const c = set.join('\n')
    expect(c, `refresh cookie 要有 HttpOnly：前端 JavaScript 讀不到，XSS 偷不走。實際：${c}`).toMatch(/;\s*HttpOnly/i)
    expect(c, `refresh cookie 要有 SameSite=Strict 或 Lax。實際：${c}`).toMatch(/;\s*SameSite=(Strict|Lax)/i)
    expect(c, `refresh cookie 的 Path 要限在 /api/v1/auth：一般 API 請求不用帶著它。實際：${c}`).toMatch(/;\s*Path=\/api\/v1\/auth/i)
  })
})
