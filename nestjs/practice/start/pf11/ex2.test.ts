// 練習 2：稽核紀錄只有自己的租戶看得到，而且只有 admin 以上能讀
import { addMember, call, expectError, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 2：誰看得到稽核紀錄', () => {
  it('租戶 B 看不到租戶 A 的紀錄（列表與篩選都是空的）', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    expect((await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: 'A 的' } })).status).toBe(201)
    const all = await call(t, 'GET', '/api/v1/audit-logs', { token: b.token })
    expect(all.status).toBe(200)
    expect(all.body.items, 'B 剛註冊、什麼都沒做，列表要是空的：查詢要經過租戶條件（TenantDb，不是 PrismaService）').toEqual([])
    const filtered = await call(t, 'GET', '/api/v1/audit-logs?action=project.created', { token: b.token })
    expect(filtered.body.items, '用 action 篩選也不能看到 A 的紀錄').toEqual([])
  })

  it('admin、owner 200；member、viewer 403 FORBIDDEN', async () => {
    const owner = await signupTenant(t)
    const admin = await addMember(t, owner, 'admin'), member = await addMember(t, owner, 'member'), viewer = await addMember(t, owner, 'viewer')
    for (const [role, acc] of [['owner', owner], ['admin', admin]] as const) {
      const r = await call(t, 'GET', '/api/v1/audit-logs', { token: acc.token })
      expect(r.status, `${role} 讀稽核要 200，實際 ${r.status}`).toBe(200)
      expect(r.body.items.length, `${role} 要看得到邀請的紀錄`).toBeGreaterThan(0)
    }
    for (const [role, acc] of [['member', member], ['viewer', viewer]] as const) {
      expectError(await call(t, 'GET', '/api/v1/audit-logs', { token: acc.token }), 403, 'FORBIDDEN', `${role} 讀稽核`)
    }
    expectError(await call(t, 'GET', '/api/v1/audit-logs'), 401, 'UNAUTHENTICATED', '沒有登入讀稽核')
  })
})
