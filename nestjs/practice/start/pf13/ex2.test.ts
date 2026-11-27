// 練習 2：匯出的租戶隔離
import { call, expectError, pollUntil, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 2：別的租戶的匯出', () => {
  it('B 讀 A 的匯出狀態與內容都 404', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)
    await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: 'A 的' } })
    const r = await call(t, 'POST', '/api/v1/exports', { token: a.token, body: { type: 'projects' } })
    expect(r.status).toBe(202)
    expectError(await call(t, 'GET', `/api/v1/exports/${r.body.id}`, { token: b.token }), 404, 'NOT_FOUND', 'B 讀 A 的匯出狀態')
    await pollUntil(async () => (await call(t, 'GET', `/api/v1/exports/${r.body.id}`, { token: a.token })).body?.status === 'done', { what: 'A 的匯出完成' })
    expectError(await call(t, 'GET', `/api/v1/exports/${r.body.id}`, { token: b.token }), 404, 'NOT_FOUND', '完成後 B 讀 A 的匯出狀態')
    expectError(await call(t, 'GET', `/api/v1/exports/${r.body.id}/content`, { token: b.token }), 404, 'NOT_FOUND', 'B 下載 A 的匯出')
  })
})
