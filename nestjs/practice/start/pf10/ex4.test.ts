// 練習 4：被移除的成員，手上還沒過期的 token 立刻失效
import { call, expectError, mailpitLink, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 4：移除成員', () => {
  it('B 也是 A 租戶的成員：switch 進 A 拿到 token；被 A 移除後，那個 token 打 /projects 401 或 403，再 switch 進 A 403', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const inv = await call(t, 'POST', '/api/v1/invitations', { token: a.token, body: { email: b.email, role: 'member' } })
    expect(inv.status, `A 邀請 B 要 201：${inv.text.slice(0, 200)}`).toBe(201)
    const token = new URL(await mailpitLink(t, b.email)).searchParams.get('token')
    const acc = await call(t, 'POST', '/api/v1/auth/invitations/accept', { body: { token } })
    expect(acc.status, `已經有帳號的人接受邀請（不用 name、password）要 200，實際 ${acc.status}：${acc.text.slice(0, 200)}`).toBe(200)
    const tenants = await call(t, 'GET', '/api/v1/auth/tenants', { token: b.token })
    expect((tenants.body?.items ?? []).map((x: { id: string }) => x.id).sort(), 'GET /api/v1/auth/tenants 要列出 B 所屬的兩個租戶').toEqual([a.tenantId, b.tenantId].sort())
    const sw = await call(t, 'POST', '/api/v1/auth/switch-tenant', { token: b.token, body: { tenantId: a.tenantId } })
    expect(sw.status, `switch-tenant 到自己是成員的租戶要 200：${sw.text.slice(0, 200)}`).toBe(200)
    const inA = sw.body.accessToken
    expect((await call(t, 'GET', '/api/v1/projects', { token: inA })).status, 'switch 之後在 A 租戶可以讀 projects').toBe(200)
    expect((await call(t, 'DELETE', `/api/v1/members/${b.userId}`, { token: a.token })).status, 'A 的 owner 移除 B 要 204').toBe(204)
    const after = await call(t, 'GET', '/api/v1/projects', { token: inA })
    expect([401, 403], `被移除之後，B 手上 A 租戶的 token 還能讀資料（${after.status}）：每個請求都要確認 membership 還在，不能只信 token 或快取`).toContain(after.status)
    expectError(await call(t, 'POST', '/api/v1/auth/switch-tenant', { token: b.token, body: { tenantId: a.tenantId } }), 403, 'FORBIDDEN', '被移除後再 switch 進 A')
    expect((await call(t, 'GET', '/api/v1/me', { token: b.token })).status, 'B 在自己租戶的 token 不受影響').toBe(200)
  })

  it('switch 到不是成員的租戶：403 FORBIDDEN', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    expectError(await call(t, 'POST', '/api/v1/auth/switch-tenant', { token: b.token, body: { tenantId: a.tenantId } }), 403, 'FORBIDDEN', 'B 切換到 A（不是成員）')
  })
})
