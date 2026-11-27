// 練習 4：同一個 email 連續登入失敗會被限流
import { call, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 4：登入限流', () => {
  it('同一個 email 連續錯 20 次，至少出現一次 429 RATE_LIMITED（有 Retry-After）', async () => {
    const a = await signupTenant(t)
    const codes: number[] = []
    let limited: Awaited<ReturnType<typeof call>> | undefined
    for (let i = 0; i < 20; i++) {
      const r = await call(t, 'POST', '/api/v1/auth/login', { body: { email: a.email, password: `wrong-password-${i}` } })
      codes.push(r.status)
      if (r.status === 429) { limited = r; break }
    }
    expect(limited, `連續錯 20 次都沒有 429（狀態碼：${codes.join(',')}）：以 email 計數失敗次數，超過門檻回 429`).toBeTruthy()
    expect(limited!.body?.errorCode, '429 的 errorCode 要是 RATE_LIMITED').toBe('RATE_LIMITED')
    expect(Number(limited!.headers.get('retry-after')), '429 要有 Retry-After 標頭（秒數）').toBeGreaterThan(0)
  })
})
