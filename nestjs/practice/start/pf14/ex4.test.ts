// 練習 4：每租戶限流
import { call, concurrent, expectError, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 4：每個租戶每分鐘 300 個請求', () => {
  it('同一個租戶第 301 個請求 429 RATE_LIMITED＋Retry-After；另一個租戶不受影響', async () => {
    const a = await signupTenant(t), b = await signupTenant(t)   // 各自已經打過 1 次 /me
    const statuses = await concurrent(20, 299, () => call(t, 'GET', '/api/v1/me', { token: a.token }).then(r => r.status))
    const early = statuses.filter(s => s !== 200)
    expect(early.length, `前 300 個請求都要 200，有 ${early.length} 個不是（${[...new Set(early)].join('、')}）：門檻是每租戶每分鐘 300`).toBe(0)
    const over = await call(t, 'GET', '/api/v1/me', { token: a.token })
    expectError(over, 429, 'RATE_LIMITED', '同一個租戶的第 301 個請求')
    const retry = Number(over.headers.get('retry-after'))
    expect(retry, `要有 Retry-After 標頭（秒數，大於 0、不超過 60），實際：${over.headers.get('retry-after')}`).toBeGreaterThan(0)
    expect(retry).toBeLessThanOrEqual(60)
    const other = await call(t, 'GET', '/api/v1/me', { token: b.token })
    expect(other.status, '另一個租戶同時要 200：限流的計數要以 tenantId 區分，不是 IP 或全域（同一間公司、同一個 NAT 後面的人共用 IP）').toBe(200)
  })
})
