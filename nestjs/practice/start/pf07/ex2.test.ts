// 練習 2：refresh token 輪替、重用偵測、登出
import { call, cookieOf, expectError, login, signupTenant, target } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

describe('練習 2：refresh 輪替與重用偵測', () => {
  it('refresh 200：回新的 accessToken 與新的 refresh cookie（輪替）', async () => {
    const a = await signupTenant(t)
    expect(a.cookie, '登入的回應要用 Set-Cookie 設 refresh token').toBeTruthy()
    const r = await call(t, 'POST', '/api/v1/auth/refresh', { cookie: a.cookie })
    expect(r.status, `POST /api/v1/auth/refresh 要 200，實際 ${r.status}：${r.text.slice(0, 200)}`).toBe(200)
    expect(typeof r.body?.accessToken, 'refresh 的回應要有新的 accessToken').toBe('string')
    const next = cookieOf(r)
    expect(next, 'refresh 要用 Set-Cookie 換一個新的 refresh token').toBeTruthy()
    expect(next, '新的 refresh token 不能跟舊的一樣：每用一次就換一張（輪替）').not.toBe(a.cookie)
    expect((await call(t, 'GET', '/api/v1/me', { token: r.body.accessToken })).status, '新的 accessToken 要能用').toBe(200)
  })

  it('用過的 refresh token 再用：401 REFRESH_REUSED，之後同一家族的新 token 也 401', async () => {
    const a = await signupTenant(t)
    const r1 = await call(t, 'POST', '/api/v1/auth/refresh', { cookie: a.cookie })
    expect(r1.status, `第一次 refresh 要 200：${r1.text.slice(0, 200)}`).toBe(200)
    const newer = cookieOf(r1)
    expectError(await call(t, 'POST', '/api/v1/auth/refresh', { cookie: a.cookie }), 401, 'REFRESH_REUSED', '已經換過的舊 refresh token 再用一次')
    const after = await call(t, 'POST', '/api/v1/auth/refresh', { cookie: newer })
    expect(after.status, `偵測到重用之後，同一家族（同一次登入換出來的）最新的 token 也要失效（401），實際 ${after.status}：被偷的人與正牌使用者分不出來，整個家族一起撤銷`).toBe(401)
  })

  it('logout 204，之後這個 refresh token 401；另一次登入不受影響', async () => {
    const a = await signupTenant(t)
    const other = await login(t, a.email)
    const out = await call(t, 'POST', '/api/v1/auth/logout', { cookie: a.cookie })
    expect(out.status, `POST /api/v1/auth/logout 要 204，實際 ${out.status}`).toBe(204)
    expect((await call(t, 'POST', '/api/v1/auth/refresh', { cookie: a.cookie })).status, '登出後，這個 refresh token 要 401').toBe(401)
    expect((await call(t, 'POST', '/api/v1/auth/refresh', { cookie: other.cookie })).status, '登出只撤銷這次登入，同一個人在別的裝置的登入（另一個家族）不受影響').toBe(200)
  })
})
