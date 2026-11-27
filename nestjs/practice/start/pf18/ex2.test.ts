// 練習 2：mass assignment：送多餘的 role、tenantId、plan 都不生效
import { addMember, call, email, login, mailpitLink, PASSWORD, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 2：mass assignment', () => {
  it('PATCH /me、PATCH /members/:id、POST /projects 帶 role、tenantId、plan：被拒絕或被忽略', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const member = await addMember(t, a, 'member')
    await call(t, 'PATCH', '/api/v1/me', { token: member.token, body: { name: '改名', role: 'owner', tenantId: b.tenantId, isPlatformAdmin: true } })
    await call(t, 'PATCH', `/api/v1/members/${member.userId}`, { token: a.token, body: { role: 'member', tenantId: b.tenantId } })
    await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: 'x', plan: 'pro', tenantId: b.tenantId } })
    const me = await call(t, 'GET', '/api/v1/me', { token: member.token })
    expect(me.body?.role, `member 送了 role: owner 之後，/me 的 role 是 ${me.body?.role}：DTO 只列出可以改的欄位，ValidationPipe 開 whitelist＋forbidNonWhitelisted`).toBe('member')
    expect(me.body?.tenant?.id, 'member 送了 tenantId 之後跑到別的租戶').toBe(a.tenantId)
    expect(me.body?.tenant?.plan, 'POST /projects 帶 plan: pro 之後，租戶的方案變了').toBe('free')
    expect((await call(t, 'GET', '/api/v1/projects', { token: b.token })).body?.items, 'A 建立 project 時帶 B 的 tenantId，資料跑到 B 了').toEqual([])
  })

  it('接受邀請時帶 role: owner，角色仍然是邀請時指定的', async () => {
    const a = await signupTenant(t)
    const e = email('viewer')
    const inv = await call(t, 'POST', '/api/v1/invitations', { token: a.token, body: { email: e, role: 'viewer' } })
    expect(inv.status, `邀請要 201：${inv.text.slice(0, 200)}`).toBe(201)
    const token = new URL(await mailpitLink(t, e)).searchParams.get('token')
    const acc = await call(t, 'POST', '/api/v1/auth/invitations/accept', { body: { token, name: '受邀者', password: PASSWORD, role: 'owner' } })
    expect([200, 400], `帶多餘的 role：拒絕（400）或忽略（200）都可以，實際 ${acc.status}：${acc.text.slice(0, 200)}`).toContain(acc.status)
    if (acc.status === 400) return
    const me = await call(t, 'GET', '/api/v1/me', { token: (await login(t, e)).token })
    expect(me.body?.role, `邀請的是 viewer，接受時送 role: owner 之後登入，/me 的角色是 ${me.body?.role}：角色只能來自邀請（伺服器存的資料），不能來自 body`).toBe('viewer')
  })
})
