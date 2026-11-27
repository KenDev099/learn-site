// 練習 3：token 的設定（OWASP API2：JWT 驗證規則、refresh token 重用偵測）
import { JwtService } from '@nestjs/jwt'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { bearer, cookieOf, login, makeApp, seed, U } from './test-fixtures.ts'

let ctx: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { ctx = await makeApp() })
beforeEach(() => seed(ctx.prisma))
afterAll(() => ctx?.app.close())

// 攻擊者拿到（或猜到）同一把秘密時能做的事：自己簽 token
function forge(options: { algorithm?: 'HS256' | 'HS512'; audience?: string } = {}) {
  const now = Math.floor(ctx.clock.now() / 1000)
  return new JwtService({ secret: process.env.JWT_SECRET }).sign({ sub: 6, ver: 0, iat: now }, {
    algorithm: options.algorithm ?? 'HS256',
    expiresIn: '15m',
    issuer: process.env.JWT_ISSUER,
    audience: options.audience ?? process.env.JWT_AUDIENCE,
  })
}
const refresh = (cookie: string) => ctx.http().post('/auth/refresh').set('Cookie', `__Secure-rt=${cookie}`)

describe('練習 3：JWT 驗證規則與 refresh token 重用偵測', () => {
  it('功能：正常登入的 token 可以用，條件都對的 token 也可以', async () => {
    const { access } = await login(ctx.app, U.wang)
    expect((await ctx.http().get('/me').set(bearer(access))).status, '剛登入的 access token 要能呼叫 GET /me').toBe(200)
    expect((await ctx.http().get('/me').set(bearer(forge())).send()).status, 'HS256、iss、aud 都正確的 token 要通過').toBe(200)
  })

  it('攻擊：aud 是別的服務的 token → 401', async () => {
    const res = await ctx.http().get('/me').set(bearer(forge({ audience: 'https://pos.coffee.example' })))
    expect(res.status, '給 POS 服務的 token 不能拿來打這支 API：verifyOptions 要設 audience（jsonwebtoken 沒給就不檢查）').toBe(401)
  })

  it('攻擊：用 HS512 簽的 token → 401', async () => {
    const res = await ctx.http().get('/me').set(bearer(forge({ algorithm: 'HS512' })))
    expect(res.status, 'verifyOptions 要固定 algorithms: [\'HS256\']，不能讓 token 的 header 決定演算法').toBe(401)
  })

  it('功能：refresh 可以連續輪替，每次拿到新的 cookie', async () => {
    const { refresh: rt1 } = await login(ctx.app, U.wang)
    const r1 = await refresh(rt1)
    expect(r1.status, '用剛拿到的 refresh token 換新的要 200').toBe(200)
    const rt2 = cookieOf(r1, '__Secure-rt')!
    expect(rt2, '輪替要發新的 __Secure-rt cookie').toBeTruthy()
    expect(rt2).not.toBe(rt1)
    expect((await refresh(rt2)).status, '新的 refresh token 要能再換一次').toBe(200)
  })

  it('攻擊：舊的 refresh token 被重用 → 401，而且同一個家族最新的 token 也失效', async () => {
    const { refresh: rt1 } = await login(ctx.app, U.wang)
    const other = await login(ctx.app, U.wang)                // 另一台裝置的登入，不受影響
    const rt2 = cookieOf(await refresh(rt1), '__Secure-rt')!
    const reuse = await refresh(rt1)
    expect(reuse.status, '用過的 refresh token 再用一次要 401').toBe(401)
    expect((await refresh(rt2)).status, '偵測到重用時分不出誰是真的使用者：要撤銷整個家族，rt2 也要 401（第 10 課）').toBe(401)
    expect((await refresh(other.refresh)).status, '別的登入（不同家族）不能被一起撤銷').toBe(200)
  })
})
