// 練習 1：註冊、登入、/me；登入失敗不洩漏帳號存不存在
import { call, email, expectError, PASSWORD, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 1：signup、login、me', () => {
  it('signup 201 回 { user, tenant, role: "owner" }；同一個 email（換大小寫）409 EMAIL_TAKEN；缺欄位 400', async () => {
    const e = email('signup')
    const body = { email: e, password: PASSWORD, name: '王小明', tenantName: '小明的團隊' }
    const res = await call(t, 'POST', '/api/v1/auth/signup', { body })
    expect(res.status, `POST /api/v1/auth/signup 要 201，實際 ${res.status}：${res.text.slice(0, 200)}`).toBe(201)
    expect(res.body?.user?.email, '回應的 user.email 要是註冊的 email（存小寫）').toBe(e)
    expect(typeof res.body?.user?.id, '回應要有 user.id').toBe('string')
    expect(typeof res.body?.tenant?.id, '回應要有 tenant.id：註冊同時建立租戶').toBe('string')
    expect(res.body?.role, '註冊的人是這個租戶的 owner').toBe('owner')
    expect(JSON.stringify(res.body), '回應不能帶出密碼或雜湊').not.toMatch(/password|argon2/i)
    expectError(await call(t, 'POST', '/api/v1/auth/signup', { body: { ...body, email: e.toUpperCase() } }), 409, 'EMAIL_TAKEN', '同一個 email 換成大寫再註冊')
    expectError(await call(t, 'POST', '/api/v1/auth/signup', { body: { email: email('half') } }), 400, 'VALIDATION_FAILED', '只送 email')
  })

  it('login 200 回 accessToken；/me 回 user、tenant、role', async () => {
    const a = await signupTenant(t)
    const me = await call(t, 'GET', '/api/v1/me', { token: a.token })
    expect(me.body?.user?.email, '/me 的 user.email').toBe(a.email)
    expect(me.body?.tenant?.id, '/me 的 tenant.id 要是註冊時建立的租戶').toBe(a.tenantId)
    expect(me.body?.role, '/me 的 role').toBe('owner')
  })

  it('密碼錯、帳號不存在：都是 401 INVALID_CREDENTIALS，body 只差在 requestId', async () => {
    const a = await signupTenant(t)
    const wrong = await call(t, 'POST', '/api/v1/auth/login', { body: { email: a.email, password: 'not-my-password' } })
    const ghost = await call(t, 'POST', '/api/v1/auth/login', { body: { email: email('ghost'), password: 'not-my-password' } })
    expectError(wrong, 401, 'INVALID_CREDENTIALS', '密碼錯')
    expectError(ghost, 401, 'INVALID_CREDENTIALS', '帳號不存在')
    const strip = (b: Record<string, unknown>) => ({ ...b, requestId: undefined })
    expect(strip(ghost.body), '帳號不存在與密碼錯的回應要完全一樣，不然攻擊者能用登入 API 一個一個試出誰有註冊').toEqual(strip(wrong.body))
  })
})
