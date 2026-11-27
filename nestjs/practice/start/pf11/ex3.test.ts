// 練習 3：失敗的操作不留下「成功」的紀錄
import { addMember, call, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 3：失敗的操作不寫稽核', () => {
  it('驗證失敗、沒有權限、找不到、別的租戶的 project：都不會出現 project.* 紀錄', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const viewer = await addMember(t, a, 'viewer')
    const pb = await call(t, 'POST', '/api/v1/projects', { token: b.token, body: { name: 'B 的' } })
    const attempts: [string, Promise<{ status: number }>, number][] = [
      ['POST 空白名稱', call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: '' } }), 400],
      ['viewer POST', call(t, 'POST', '/api/v1/projects', { token: viewer.token, body: { name: 'x' } }), 403],
      ['PATCH 不存在的 id', call(t, 'PATCH', `/api/v1/projects/${crypto.randomUUID()}`, { token: a.token, body: { name: 'x' } }), 404],
      ['PATCH B 的 project', call(t, 'PATCH', `/api/v1/projects/${pb.body.id}`, { token: a.token, body: { name: 'x' } }), 404],
      ['DELETE 不存在的 id', call(t, 'DELETE', `/api/v1/projects/${crypto.randomUUID()}`, { token: a.token }), 404],
      ['DELETE B 的 project', call(t, 'DELETE', `/api/v1/projects/${pb.body.id}`, { token: a.token }), 404],
    ]
    for (const [what, p, status] of attempts) expect((await p).status, `${what}要 ${status}`).toBe(status)
    const logs = (await call(t, 'GET', '/api/v1/audit-logs', { token: a.token })).body.items as { action: string; targetId: string }[]
    const bad = logs.filter(l => l.action.startsWith('project.'))
    expect(bad.map(l => `${l.action} ${l.targetId}`), '失敗的操作不能有紀錄：稽核要跟業務寫在同一個交易，業務沒成功，稽核就跟著回滾').toEqual([])
    const bLogs = (await call(t, 'GET', '/api/v1/audit-logs', { token: b.token })).body.items as { action: string }[]
    expect(bLogs.map(l => l.action), 'B 只會有自己建立 project 的那一筆').toEqual(['project.created'])
  })
})
