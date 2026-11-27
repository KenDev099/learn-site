// 練習 2：租戶內的權限矩陣（CONTRACT-saas.md）
import { addMember, call, email, signupTenant, target, type Account } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
type Role = 'viewer' | 'member' | 'admin' | 'owner'

describe('練習 2：權限矩陣', () => {
  it('四個角色對 projects、members、invitations 的狀態碼都照契約', async () => {
    const owner = await signupTenant(t)
    const acc: Record<Role, Account> = { owner, admin: await addMember(t, owner, 'admin'), member: await addMember(t, owner, 'member'), viewer: await addMember(t, owner, 'viewer') }
    const first = await call(t, 'POST', '/api/v1/projects', { token: owner.token, body: { name: '共用的' } })
    expect(first.status, `owner 建立 project 要 201：${first.text.slice(0, 200)}`).toBe(201)
    const p = first.body.id
    const inv = await call(t, 'POST', '/api/v1/invitations', { token: owner.token, body: { email: email('pending'), role: 'viewer' } })
    expect(inv.status, `owner 邀請要 201：${inv.text.slice(0, 200)}`).toBe(201)
    const created: Partial<Record<Role, string>> = {}
    // [角色, 方法, 路徑, body, 預期狀態碼]；路徑可以是函式（用前面步驟建立的資料）
    const rows: [Role, string, string | (() => string), unknown, number][] = [
      ['viewer', 'GET', '/api/v1/projects', undefined, 200],
      ['viewer', 'GET', `/api/v1/projects/${p}`, undefined, 200],
      ['viewer', 'POST', '/api/v1/projects', { name: 'v' }, 403],
      ['viewer', 'PATCH', `/api/v1/projects/${p}`, { name: 'v' }, 403],
      ['viewer', 'DELETE', `/api/v1/projects/${p}`, undefined, 403],
      ['viewer', 'GET', '/api/v1/members', undefined, 200],
      ['viewer', 'PATCH', `/api/v1/members/${acc.viewer.userId}`, { role: 'member' }, 403],
      ['viewer', 'GET', '/api/v1/invitations', undefined, 403],
      ['viewer', 'POST', '/api/v1/invitations', { email: email('x'), role: 'viewer' }, 403],
      ['member', 'POST', '/api/v1/projects', { name: 'm' }, 201],
      ['member', 'PATCH', `/api/v1/projects/${p}`, { name: 'm' }, 200],
      ['member', 'DELETE', `/api/v1/projects/${p}`, undefined, 403],
      ['member', 'GET', '/api/v1/members', undefined, 200],
      ['member', 'PATCH', `/api/v1/members/${acc.viewer.userId}`, { role: 'member' }, 403],
      ['member', 'DELETE', `/api/v1/members/${acc.viewer.userId}`, undefined, 403],
      ['member', 'GET', '/api/v1/invitations', undefined, 403],
      ['member', 'POST', '/api/v1/invitations', { email: email('x'), role: 'viewer' }, 403],
      ['member', 'DELETE', `/api/v1/invitations/${inv.body.id}`, undefined, 403],
      ['admin', 'PATCH', `/api/v1/projects/${p}`, { name: 'a' }, 200],
      ['admin', 'DELETE', () => `/api/v1/projects/${created.member}`, undefined, 204],
      ['admin', 'GET', '/api/v1/invitations', undefined, 200],
      ['admin', 'PATCH', `/api/v1/members/${acc.viewer.userId}`, { role: 'member' }, 200],
      ['admin', 'DELETE', `/api/v1/invitations/${inv.body.id}`, undefined, 204],
      ['owner', 'GET', '/api/v1/invitations', undefined, 200],
      ['owner', 'DELETE', `/api/v1/projects/${p}`, undefined, 204],
    ]
    const wrong: string[] = []
    for (const [role, method, path, body, expected] of rows) {
      const url = typeof path === 'function' ? path() : path
      const r = await call(t, method, url, { token: acc[role].token, body })
      if (method === 'POST' && url === '/api/v1/projects' && r.status === 201) created[role] = r.body.id
      if (r.status !== expected) wrong.push(`${role} ${method} ${url.replace(/[0-9a-f-]{36}/g, ':id')} → ${r.status}（要 ${expected}）`)
    }
    expect(wrong, '這幾格跟契約的權限矩陣不一樣：角色要每個請求從 membership 查（不是 token 裡的），每個路由都要宣告權限').toEqual([])
  })

  it('角色改了，同一個 access token 的權限立刻跟著變', async () => {
    const owner = await signupTenant(t)
    const admin = await addMember(t, owner, 'admin')
    expect((await call(t, 'GET', '/api/v1/invitations', { token: admin.token })).status, 'admin 可以列出邀請').toBe(200)
    expect((await call(t, 'PATCH', `/api/v1/members/${admin.userId}`, { token: owner.token, body: { role: 'viewer' } })).status, 'owner 把 admin 降成 viewer 要 200').toBe(200)
    const after = await call(t, 'GET', '/api/v1/invitations', { token: admin.token })
    expect(after.status, `降成 viewer 之後，他手上還沒過期的 token 要立刻沒有 admin 權限（403），實際 ${after.status}：角色不能放在 token 裡信任`).toBe(403)
  })
})
