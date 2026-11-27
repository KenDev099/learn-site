// 練習 5：登入防暴力破解（第 16 課的規則）
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PasswordService } from './src/auth/password.service.js'
import { makeApp, PASSWORD, seed, U } from './test-fixtures.ts'

let ctx: Awaited<ReturnType<typeof makeApp>>
const passwords = new PasswordService()
const verify = vi.spyOn(passwords, 'verify')
beforeAll(async () => { ctx = await makeApp(b => b.overrideProvider(PasswordService).useValue(passwords)) })
beforeEach(() => seed(ctx.prisma))
afterAll(() => ctx?.app.close())

// app 設了 trust proxy loopback：測試從本機連線，X-Forwarded-For 就是使用者的 IP
const tryLogin = (email: string, password: string, ip: string) =>
  ctx.http().post('/auth/login').set('X-Forwarded-For', ip).send({ email, password })
const later = (seconds: number) => { ctx.clock.t += seconds * 1000 }

describe('練習 5：登入限流', () => {
  it('攻擊：不存在的帳號與密碼錯誤，回應相同，而且一樣會跑一次密碼驗證', async () => {
    const wrong = await tryLogin(U.chen, 'wrong-password', '198.51.100.1')
    verify.mockClear()
    const ghost = await tryLogin('ghost@example.com', 'wrong-password', '198.51.100.1')
    expect(ghost.status).toBe(401)
    expect(ghost.body, '不存在的帳號與密碼錯誤要回一模一樣的內容').toEqual(wrong.body)
    expect(verify, '帳號不存在時也要呼叫 PasswordService.verify（用一個假的雜湊），否則回應時間會洩漏帳號存不存在').toHaveBeenCalled()
  })

  it('攻擊：同一個帳號連續失敗 → 逐步延遲，換 IP 也一樣被擋', async () => {
    const email = U.wang
    for (let i = 1; i <= 5; i++) expect((await tryLogin(email, `guess-${i}`, `203.0.113.${i}`)).status, `第 ${i} 次猜錯回 401`).toBe(401)
    const blocked = await tryLogin(email, 'guess-6', '203.0.113.99')
    expect(blocked.status, '同一個帳號失敗 5 次後立刻再試要 429（就算換了 IP：攻擊者會換 IP，只限 IP 擋不住）').toBe(429)
    expect(blocked.headers['retry-after'], '429 要帶 Retry-After：5 次失敗後等 1 秒').toBe('1')
    verify.mockClear()
    expect((await tryLogin(email, PASSWORD, '203.0.113.99')).status, '被擋的期間連正確密碼也是 429（被擋時不驗密碼）').toBe(429)
    expect(verify, '被擋的請求不能呼叫 PasswordService.verify：先檢查限流，被擋就直接回 429，攻擊者才拿不到「密碼對不對」的任何訊號').not.toHaveBeenCalled()

    later(1)
    expect((await tryLogin(email, 'guess-6', '203.0.113.6')).status, '等了 1 秒之後可以再試（這次又猜錯，401）').toBe(401)
    const again = await tryLogin(email, 'guess-7', '203.0.113.7')
    expect(again.status, '第 6 次失敗後要等 2 秒').toBe(429)
    expect(again.headers['retry-after']).toBe('2')

    later(2)
    expect((await tryLogin(email, PASSWORD, '203.0.113.8')).status, '等夠了，正確密碼要能登入：不能永久鎖帳號').toBe(200)
    for (let i = 1; i <= 2; i++) expect((await tryLogin(email, `oops-${i}`, '203.0.113.8')).status, '登入成功後這個帳號的失敗次數歸零，打錯一兩次不會被擋').toBe(401)
  })

  it('攻擊：同一個 IP 對很多帳號失敗 100 次 → 這個 IP 被擋，登入成功也不會重設 IP 的計數', { timeout: 60_000 }, async () => {
    const ip = '192.0.2.50'
    for (let i = 1; i <= 99; i++) {
      const r = await tryLogin(`user${i}@example.com`, 'Password123', ip)
      expect(r.status, `密碼噴灑第 ${i} 次：還沒到上限，回 401`).toBe(401)
    }
    expect((await tryLogin(U.chen, PASSWORD, ip)).status, '同一個 IP 的正常登入要成功').toBe(200)
    expect((await tryLogin('user100@example.com', 'Password123', ip)).status, '第 100 次失敗：登入成功不能把 IP 的計數歸零，這次仍是 401').toBe(401)
    const blocked = await tryLogin('user101@example.com', 'Password123', ip)
    expect(blocked.status, '這個 IP 15 分鐘內失敗 100 次，接下來要 429').toBe(429)
    expect(Number(blocked.headers['retry-after']), 'Retry-After 是到視窗結束的秒數（最多 900）').toBeGreaterThan(0)
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(900)
    expect((await tryLogin(U.lin, PASSWORD, '192.0.2.51')).status, '別的 IP 不受影響').toBe(200)

    later(15 * 60)
    expect((await tryLogin(U.chen, PASSWORD, ip)).status, '15 分鐘的視窗過了，這個 IP 可以再登入').toBe(200)
  })
})
