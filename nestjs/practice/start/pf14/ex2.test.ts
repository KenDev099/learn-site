// 練習 2：用量檢查的競態
import { call, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 2：同時建立', () => {
  it('已有 2 個 project 時同時送 10 個建立：恰好 1 個 201、9 個 403 PLAN_LIMIT_REACHED，最後 3 個', async () => {
    const a = await signupTenant(t)
    for (const name of ['一', '二']) expect((await call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name } })).status).toBe(201)
    // 先同時打 10 個讀取，讓 API 的連線池把連線都開好；不然第一波請求會因為等著開連線而剛好排成一列，測不出競態
    await Promise.all(Array.from({ length: 10 }, () => call(t, 'GET', '/api/v1/projects', { token: a.token })))
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => call(t, 'POST', '/api/v1/projects', { token: a.token, body: { name: `同時 ${i}` } })))
    const total = (await call(t, 'GET', '/api/v1/projects', { token: a.token })).body.items.length
    expect(total, `最後有 ${total} 個 project（上限 3）：先數再建立的兩個請求會同時數到 2。要在同一個交易裡先鎖住租戶列（SELECT … FOR UPDATE）再數，或用條件式更新計數器`).toBe(3)
    const codes = results.map(r => `${r.status} ${r.body?.errorCode ?? ''}`.trim()).sort()
    expect(codes, '被擋下的要回 403 PLAN_LIMIT_REACHED（不是 500：SERIALIZABLE 要自己重試）').toEqual(['201', ...Array(9).fill('403 PLAN_LIMIT_REACHED')])
  })
})
