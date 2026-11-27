// 練習 2：建立時送 tenantId 不會讓資料跑到別的租戶
import { call, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 2：建立時不採用請求送來的 tenantId', () => {
  it('POST /projects 的 body 帶 tenantId: <B>：回 400，或建在自己的租戶；B 的列表一定是空的', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const r = await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: '偷渡', tenantId: b.tenantId } })
    expect([201, 400], `body 帶 tenantId 時要回 400（DTO 不認得這個欄位）或 201（忽略它），實際 ${r.status}：${r.text.slice(0, 200)}`).toContain(r.status)
    const inB = await call(t, 'GET', '/api/v1/projects', { token: b.token })
    expect(inB.body?.items ?? [], 'A 送了 tenantId: <B>，資料就建到 B 的租戶裡了（mass assignment）：tenantId 只能從 token 來').toEqual([])
    if (r.status === 201) {
      const own = await call(t, 'GET', `/api/v1/projects/${r.body.id}`, { token: a.token })
      expect(own.status, '回 201 的話，這筆 project 要在 A 自己的租戶裡').toBe(200)
    }
  })
})
