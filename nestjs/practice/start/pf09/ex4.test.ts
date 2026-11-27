// 練習 4：開了 RLS 之後，還沒有租戶的路徑（註冊、登入、refresh）照樣能用，第 8 課的隔離仍然成立
import { call, cookieOf, expectError, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 4：RLS 開了之後', () => {
  it('signup、login、refresh、/me 都正常', async () => {
    const a = await signupTenant(t)   // signup 201、login 200、/me 200
    const r = await call(t, 'POST', '/api/v1/auth/refresh', { cookie: a.cookie })
    expect(r.status, `refresh 要 200，實際 ${r.status}：${r.text.slice(0, 200)}。refresh token 的表開了 RLS 的話，查詢前要先設好「這是誰」的上下文`).toBe(200)
    expect(cookieOf(r), 'refresh 要換一張新的 cookie').toBeTruthy()
  })

  it('projects 建立、讀取、修改、刪除正常；別的租戶 404', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    const c = await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: 'A' } })
    expect(c.status, `建立 project 要 201，實際 ${c.status}：${c.text.slice(0, 200)}`).toBe(201)
    const id = c.body.id
    expect((await call(t, 'GET', `/api/v1/projects/${id}`, { token: a.token })).status, '讀自己的 project').toBe(200)
    expect((await call(t, 'PATCH', `/api/v1/projects/${id}`, { token: a.token, body: { name: 'A2' } })).body?.name, '改自己的 project').toBe('A2')
    expectError(await call(t, 'GET', `/api/v1/projects/${id}`, { token: b.token }), 404, 'NOT_FOUND', 'B 讀 A 的 project')
    expect((await call(t, 'DELETE', `/api/v1/projects/${id}`, { token: a.token })).status, '刪自己的 project').toBe(204)
  })
})
