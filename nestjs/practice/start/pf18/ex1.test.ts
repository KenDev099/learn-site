// 練習 1：BOLA 探針：你登記在 work/portfolio.json 的 bolaProbes，每個端點都擋得住別的租戶與低權限角色
import { addMember, call, signupTenant, target, type BolaProbe } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 1：BOLA 探針', () => {
  it('至少登記 2 個探針（你的業務模組的端點）', () => {
    expect(t.bolaProbes.length, `work/portfolio.json 的 saas.bolaProbes 只有 ${t.bolaProbes.length} 個：把你的業務模組裡有 /:id 的資源登記進去（格式見 portfolio/CONTRACT-saas.md），至少 2 個`).toBeGreaterThanOrEqual(2)
  })

  for (const probe of t.bolaProbes as BolaProbe[]) {
    it(`探針「${probe.name}」：別的租戶 404、viewer 不能改、沒登入 401`, async () => {
      const a = await signupTenant(t), b = await signupTenant(t)
      const member = await addMember(t, a, 'member'), viewer = await addMember(t, a, 'viewer')
      const created = await call(t, 'POST', probe.create.path, { token: member.token, body: probe.create.body })
      expect(created.status, `${probe.name}：A 的 member POST ${probe.create.path} 要 201（探針的 create 寫錯了？）：${created.text.slice(0, 200)}`).toBe(201)
      expect(typeof created.body?.id, `${probe.name}：建立的回應要有 id`).toBe('string')
      const item = probe.item.replace(':id', created.body.id)
      const fails: string[] = []
      const check = async (who: string, method: string, token: string | undefined, want: number, body?: unknown) => {
        const r = await call(t, method, item, { token, body })
        if (r.status !== want) fails.push(`${who} ${method} ${item} → ${r.status}（要 ${want}）`)
      }
      await check('A 的 member', 'GET', member.token, 200)   // 確認探針本身有效
      await check('B 的 owner', 'GET', b.token, 404)
      await check('B 的 owner', 'PATCH', b.token, 404, probe.update.body)
      await check('B 的 owner', 'DELETE', b.token, 404)
      await check('A 的 viewer', 'PATCH', viewer.token, 403, probe.update.body)
      await check('A 的 viewer', 'DELETE', viewer.token, 403)
      await check('沒登入', 'GET', undefined, 401)
      await check('A 的 member', 'GET', member.token, 200)   // B 的 PATCH／DELETE 沒有真的改到、刪到
      expect(fails, `${probe.name}：${fails.join('；')}。別的租戶要 404（不是 403：不透露資源存在）；查詢一定要帶租戶條件，不要繞過 TenantDb 直接用沒有擴充的 client`).toEqual([])
    })
  }
})
