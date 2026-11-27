// 練習 3：成員上限把待接受的邀請算進去
import { call, email, expectError, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 3：成員上限', () => {
  it('owner＋4 封待接受的邀請＝5：第 5 封 403 PLAN_LIMIT_REACHED；撤銷一封後可以再邀', async () => {
    const owner = await signupTenant(t)
    const ids: string[] = []
    for (let i = 1; i <= 4; i++) {
      const r = await call(t, 'POST', '/api/v1/invitations', { token: owner.token, body: { email: email('cap'), role: 'viewer' } })
      expect(r.status, `第 ${i} 封邀請要 201：${r.text.slice(0, 200)}`).toBe(201)
      ids.push(r.body.id)
    }
    expectError(await call(t, 'POST', '/api/v1/invitations', { token: owner.token, body: { email: email('cap'), role: 'viewer' } }), 403, 'PLAN_LIMIT_REACHED',
      '已有 1 位成員＋4 封待接受的邀請，再邀第 5 封（邀請不算的話，可以先發 100 封再一個一個接受）')
    expect((await call(t, 'DELETE', `/api/v1/invitations/${ids[0]}`, { token: owner.token })).status).toBe(204)
    expect((await call(t, 'POST', '/api/v1/invitations', { token: owner.token, body: { email: email('cap'), role: 'viewer' } })).status, '撤銷的邀請不算，可以再邀一封').toBe(201)
  })
})
