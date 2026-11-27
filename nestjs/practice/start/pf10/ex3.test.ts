// 練習 3：角色規則：不能給比自己高的角色、不能管比自己高的人、最後一位 owner
import { addMember, call, email, expectError, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 3：角色規則', () => {
  it('admin 不能邀請 owner、不能把人升成 owner、不能動 owner：403 FORBIDDEN', async () => {
    const owner = await signupTenant(t)
    const admin = await addMember(t, owner, 'admin')
    const member = await addMember(t, owner, 'member')
    expectError(await call(t, 'POST', '/api/v1/invitations', { token: admin.token, body: { email: email('boss'), role: 'owner' } }), 403, 'FORBIDDEN', 'admin 邀請 owner')
    expectError(await call(t, 'PATCH', `/api/v1/members/${member.userId}`, { token: admin.token, body: { role: 'owner' } }), 403, 'FORBIDDEN', 'admin 把 member 升成 owner')
    expectError(await call(t, 'PATCH', `/api/v1/members/${owner.userId}`, { token: admin.token, body: { role: 'viewer' } }), 403, 'FORBIDDEN', 'admin 把 owner 降成 viewer')
    expectError(await call(t, 'DELETE', `/api/v1/members/${owner.userId}`, { token: admin.token }), 403, 'FORBIDDEN', 'admin 移除 owner')
    const me = await call(t, 'GET', '/api/v1/me', { token: owner.token })
    expect(me.body?.role, 'owner 還是 owner').toBe('owner')
  })

  it('最後一位 owner 不能被降級或移除：409 LAST_OWNER；有兩位 owner 時可以', async () => {
    const owner = await signupTenant(t)
    expectError(await call(t, 'PATCH', `/api/v1/members/${owner.userId}`, { token: owner.token, body: { role: 'admin' } }), 409, 'LAST_OWNER', '唯一的 owner 把自己降成 admin')
    expectError(await call(t, 'DELETE', `/api/v1/members/${owner.userId}`, { token: owner.token }), 409, 'LAST_OWNER', '唯一的 owner 離開租戶')
    const second = await addMember(t, owner, 'owner')
    const r = await call(t, 'PATCH', `/api/v1/members/${second.userId}`, { token: owner.token, body: { role: 'admin' } })
    expect(r.status, `還有別的 owner 時可以把另一位 owner 降級（200），實際 ${r.status}：${r.text.slice(0, 200)}`).toBe(200)
  })
})
