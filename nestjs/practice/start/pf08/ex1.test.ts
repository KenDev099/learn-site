// 練習 1：租戶之間看不到、改不到、刪不掉彼此的 project
import { call, expectError, signupTenant, target, type Account } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

async function project(acc: Account, name: string) {
  const r = await call(t, 'POST', '/api/v1/projects', { token: acc.token, body: { name } })
  expect(r.status, `POST /api/v1/projects 要 201，實際 ${r.status}：${r.text.slice(0, 200)}`).toBe(201)
  return r.body.id as string
}
const ids = (r: { body: any }) => (r.body?.items ?? []).map((p: { id: string }) => p.id)

describe('練習 1：projects 的租戶隔離', () => {
  it('列表只有自己租戶的 project', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const pa = await project(a, 'A 的專案'), pb = await project(b, 'B 的專案')
    const list = await call(t, 'GET', '/api/v1/projects', { token: a.token })
    expect(list.status, `GET /api/v1/projects 要 200：${list.text.slice(0, 200)}`).toBe(200)
    expect(ids(list), 'A 的列表裡要有 A 自己的 project').toContain(pa)
    expect(ids(list), 'A 的列表裡出現了 B 的 project：查詢沒有加 tenantId 條件').not.toContain(pb)
  })

  it('GET／PATCH／DELETE 別的租戶的 project：都是 404 NOT_FOUND，B 的資料沒有被改', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const pb = await project(b, 'B 的專案')
    expectError(await call(t, 'GET', `/api/v1/projects/${pb}`, { token: a.token }), 404, 'NOT_FOUND', 'A 讀 B 的 project')
    expectError(await call(t, 'PATCH', `/api/v1/projects/${pb}`, { token: a.token, body: { name: '被 A 改了' } }), 404, 'NOT_FOUND', 'A 改 B 的 project')
    expectError(await call(t, 'DELETE', `/api/v1/projects/${pb}`, { token: a.token }), 404, 'NOT_FOUND', 'A 刪 B 的 project')
    const still = await call(t, 'GET', `/api/v1/projects/${pb}`, { token: b.token })
    expect(still.status, 'B 的 project 被刪掉了：delete 的條件只有 id，沒有 tenantId').toBe(200)
    expect(still.body?.name, 'B 的 project 被 A 改名了：update 的條件只有 id，沒有 tenantId（回 404 之前就已經寫進去了）').toBe('B 的專案')
  })

  it('請求帶 x-tenant-id 標頭也換不了租戶：租戶只從 access token 來', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const pb = await project(b, 'B 的專案')
    const headers = { 'x-tenant-id': b.tenantId }
    const list = await call(t, 'GET', '/api/v1/projects', { token: a.token, headers })
    expect(ids(list), 'A 帶著 x-tenant-id: <B> 就看到 B 的 project：不能信任請求送來的租戶 ID').not.toContain(pb)
    const one = await call(t, 'GET', `/api/v1/projects/${pb}`, { token: a.token, headers })
    expect(one.status, `A 帶著 x-tenant-id: <B> 讀 B 的 project 要 404，實際 ${one.status}`).toBe(404)
  })
})
