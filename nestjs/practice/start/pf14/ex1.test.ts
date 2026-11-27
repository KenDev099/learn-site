// 練習 1：免費方案的 project 上限；只有 owner 能改方案
import { addMember, call, expectError, signupTenant, target, type Account } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')
const create = (acc: Account, name: string) => call(t, 'POST', '/api/v1/projects', { token: acc.token, body: { name } })

describe('練習 1：方案上限', () => {
  it('第 4 個 project 403 PLAN_LIMIT_REACHED；owner 升級 pro 後可以建立；降回 free 後不能再新增', async () => {
    const owner = await signupTenant(t)
    for (let i = 1; i <= 3; i++) expect((await create(owner, `第 ${i} 個`)).status, `第 ${i} 個 project 要 201`).toBe(201)
    expectError(await create(owner, '第 4 個'), 403, 'PLAN_LIMIT_REACHED', '免費方案的第 4 個 project')
    const up = await call(t, 'POST', '/api/v1/billing/plan', { token: owner.token, body: { plan: 'pro' } })
    expect(up.status, `owner 升級要 200：${up.text.slice(0, 200)}`).toBe(200)
    expect(up.body, '回應同 GET /billing').toMatchObject({ plan: 'pro', limits: { projects: 100 } })
    expect((await create(owner, '第 4 個')).status, '升級 pro 後第 4 個 project 要 201').toBe(201)
    expect((await call(t, 'POST', '/api/v1/billing/plan', { token: owner.token, body: { plan: 'free' } })).status).toBe(200)
    expectError(await create(owner, '第 5 個'), 403, 'PLAN_LIMIT_REACHED', '降回 free（已經有 4 個）再新增')
    expect((await call(t, 'GET', '/api/v1/projects', { token: owner.token })).body.items.length, '降級不刪資料：4 個 project 都還在').toBe(4)
  })

  it('改方案只有 owner：admin、member 403；plan 不認得 400', async () => {
    const owner = await signupTenant(t)
    const admin = await addMember(t, owner, 'admin'), member = await addMember(t, owner, 'member')
    for (const [role, acc] of [['admin', admin], ['member', member]] as const) {
      expectError(await call(t, 'POST', '/api/v1/billing/plan', { token: acc.token, body: { plan: 'pro' } }), 403, 'FORBIDDEN', `${role} 改方案`)
    }
    expect((await call(t, 'GET', '/api/v1/billing', { token: member.token })).body?.plan, '別人改不了，方案還是 free').toBe('free')
    expectError(await call(t, 'POST', '/api/v1/billing/plan', { token: owner.token, body: { plan: 'enterprise' } }), 400, 'VALIDATION_FAILED', 'plan: "enterprise"')
  })
})
