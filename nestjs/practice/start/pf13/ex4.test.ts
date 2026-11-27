// 練習 4：CSV injection
import { call, pollUntil, signupTenant, target } from '../../helpers/portfolio.ts'
import { parseCsv } from './csv.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 4：公式開頭的值', () => {
  it('= + @ 開頭的名稱，匯出後前面多一個單引號', async () => {
    const a = await signupTenant(t)
    const names = ['=1+2', '+886912345678', '@SUM(A1)']
    for (const name of names) expect((await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name } })).status).toBe(201)
    const r = await call(t, 'POST', '/api/v1/exports', { token: a.token, body: { type: 'projects' } })
    expect(r.status).toBe(202)
    await pollUntil(async () => (await call(t, 'GET', `/api/v1/exports/${r.body.id}`, { token: a.token })).body?.status === 'done', { what: '匯出完成' })
    const rows = parseCsv((await call(t, 'GET', `/api/v1/exports/${r.body.id}/content`, { token: a.token })).text)
    expect(rows.slice(1).map(r => r[1]), '開頭是 = + - @ 的值前面要加 \'，試算表才不會把它當公式執行').toEqual(names.map(n => `'${n}`))
  })
})
