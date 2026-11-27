// 練習 3：誰可以匯出
import { addMember, call, expectError, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 3：匯出的權限與輸入', () => {
  it('viewer 403；member 202；不認得的 type 400', async () => {
    const owner = await signupTenant(t)
    const member = await addMember(t, owner, 'member'), viewer = await addMember(t, owner, 'viewer')
    expectError(await call(t, 'POST', '/api/v1/exports', { token: viewer.token, body: { type: 'projects' } }), 403, 'FORBIDDEN', 'viewer 建立匯出')
    const r = await call(t, 'POST', '/api/v1/exports', { token: member.token, body: { type: 'projects' } })
    expect(r.status, `member 建立匯出要 202：${r.text.slice(0, 200)}`).toBe(202)
    expect((await call(t, 'GET', `/api/v1/exports/${r.body.id}`, { token: viewer.token })).status, 'viewer 可以讀匯出狀態').toBe(200)
    expectError(await call(t, 'POST', '/api/v1/exports', { token: member.token, body: { type: 'users' } }), 400, 'VALIDATION_FAILED', 'type: "users"')
  })
})
