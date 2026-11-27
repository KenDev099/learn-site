// 練習 1：每個成功的操作寫一筆稽核，actor、目標、requestId 都對
import { addMember, call, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

type Log = { id: string; actorId: string; action: string; targetType: string; targetId: string; requestId: string; createdAt: string }

describe('練習 1：稽核紀錄的內容', () => {
  it('專案、成員、邀請的操作各有一筆，actor、targetId、requestId 正確，新的在前', async () => {
    const owner = await signupTenant(t)
    const member = await addMember(t, owner, 'member')   // invitation.created（owner）、invitation.accepted（新成員）
    const created = await call(t, 'POST', '/api/v1/projects', { token: owner.token, body: { name: '稽核練習' } })
    expect(created.status, `POST /api/v1/projects 要 201：${created.text.slice(0, 200)}`).toBe(201)
    const pid = created.body.id as string
    const rid = created.headers.get('x-request-id')
    expect(rid, '回應要有 x-request-id 標頭（第 6 課）').toBeTruthy()
    expect((await call(t, 'PATCH', `/api/v1/projects/${pid}`, { token: owner.token, body: { name: '改名' } })).status).toBe(200)
    expect((await call(t, 'PATCH', `/api/v1/members/${member.userId}`, { token: owner.token, body: { role: 'viewer' } })).status).toBe(200)
    expect((await call(t, 'DELETE', `/api/v1/projects/${pid}`, { token: owner.token })).status).toBe(204)

    const res = await call(t, 'GET', '/api/v1/audit-logs', { token: owner.token })
    expect(res.status, `GET /api/v1/audit-logs（owner）要 200：${res.text.slice(0, 200)}`).toBe(200)
    expect(Array.isArray(res.body?.items), '回應要是 { items, nextCursor }').toBe(true)
    const logs = res.body.items as Log[]
    const expected: [string, string, string][] = [   // action、actorId、targetId
      ['invitation.created', owner.userId, ''],
      ['invitation.accepted', member.userId, ''],
      ['project.created', owner.userId, pid],
      ['project.updated', owner.userId, pid],
      ['member.role_changed', owner.userId, member.userId],
      ['project.deleted', owner.userId, pid],
    ]
    for (const [action, actorId, targetId] of expected) {
      const found = logs.filter(l => l.action === action)
      expect(found.length, `要恰好一筆 ${action}，實際 ${found.length} 筆（目前的 action：${logs.map(l => l.action).join('、') || '沒有'}）`).toBe(1)
      expect(found[0].actorId, `${action} 的 actorId 要是做這件事的人（${actorId}）`).toBe(actorId)
      if (targetId) expect(found[0].targetId, `${action} 的 targetId 要是 ${targetId}`).toBe(targetId)
      for (const k of ['id', 'targetType', 'requestId', 'createdAt'] as const) expect(found[0][k], `${action} 要有 ${k}`).toBeTruthy()
    }
    expect(logs.find(l => l.action === 'project.created')!.requestId, 'project.created 的 requestId 要等於那次回應的 x-request-id').toBe(rid)
    const order = logs.map(l => l.action)
    expect(order.indexOf('project.deleted'), '列表要新的在前：project.deleted 要排在 project.created 前面').toBeLessThan(order.indexOf('project.created'))
  })

  it('?action= 只回那一種', async () => {
    const owner = await signupTenant(t)
    const p = await call(t, 'POST', '/api/v1/projects', { token: owner.token, body: { name: 'a' } })
    await call(t, 'PATCH', `/api/v1/projects/${p.body.id}`, { token: owner.token, body: { name: 'b' } })
    const res = await call(t, 'GET', '/api/v1/audit-logs?action=project.updated', { token: owner.token })
    expect(res.status).toBe(200)
    expect(res.body.items.map((l: Log) => l.action), '?action=project.updated 只能回 project.updated').toEqual(['project.updated'])
  })
})
