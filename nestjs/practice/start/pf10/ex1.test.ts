// 練習 1：邀請流程：寄信 → 從信裡的連結接受 → 成為成員；token 只能用一次、撤銷後失效；連結的網址不看請求的 Host
import { request } from 'node:http'
import { call, email, expectError, login, mailpitLink, PASSWORD, signupTenant, target, type Account } from '../../helpers/portfolio.ts'

const t = await target(import.meta.dirname, 'saas')

async function invite(owner: Account, e: string, role: string) {
  const r = await call(t, 'POST', '/api/v1/invitations', { token: owner.token, body: { email: e, role } })
  expect(r.status, `POST /api/v1/invitations 要 201，實際 ${r.status}：${r.text.slice(0, 200)}`).toBe(201)
  return r.body.id as string
}
const tokenOf = (link: string) => {
  const token = new URL(link).searchParams.get('token')
  expect(token, `邀請信的連結要帶 ?token=…，實際：${link}`).toBeTruthy()
  return token!
}
const accept = (token: string) => call(t, 'POST', '/api/v1/auth/invitations/accept', { body: { token, name: '新成員', password: PASSWORD } })

describe('練習 1：邀請', () => {
  it('邀請 → 信裡的連結 → 接受 → 用新帳號登入，/me 是這個租戶、角色是邀請時給的', async () => {
    const owner = await signupTenant(t)
    const e = email('invitee')
    await invite(owner, e, 'member')
    const token = tokenOf(await mailpitLink(t, e))
    const r = await accept(token)
    expect(r.status, `POST /api/v1/auth/invitations/accept 要 200，實際 ${r.status}：${r.text.slice(0, 200)}`).toBe(200)
    expect(r.body?.tenant?.id, '接受邀請的回應要有 tenant.id').toBe(owner.tenantId)
    const m = await login(t, e)
    const me = await call(t, 'GET', '/api/v1/me', { token: m.token })
    expect(me.body?.tenant?.id, '新成員登入後的租戶').toBe(owner.tenantId)
    expect(me.body?.role, '新成員的角色要是邀請時給的 member').toBe('member')
  })

  it('同一個 token 再用一次：410 INVITATION_USED；撤銷的邀請：410 INVITATION_REVOKED', async () => {
    const owner = await signupTenant(t)
    const e1 = email('once')
    await invite(owner, e1, 'viewer')
    const token = tokenOf(await mailpitLink(t, e1))
    expect((await accept(token)).status, '第一次接受要 200').toBe(200)
    expectError(await accept(token), 410, 'INVITATION_USED', '同一個邀請 token 用第二次')
    const e2 = email('revoked')
    const id = await invite(owner, e2, 'viewer')
    const token2 = tokenOf(await mailpitLink(t, e2))
    expect((await call(t, 'DELETE', `/api/v1/invitations/${id}`, { token: owner.token })).status, 'DELETE /api/v1/invitations/:id 要 204').toBe(204)
    expectError(await accept(token2), 410, 'INVITATION_REVOKED', '撤銷之後才接受')
  })

  it('請求的 Host 是 evil.example 時，信裡的連結仍然是設定的前端網址', async () => {
    const owner = await signupTenant(t)
    const e = email('host')
    const api = new URL(t.api)
    const body = JSON.stringify({ email: e, role: 'viewer' })
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ host: api.hostname, port: api.port, path: '/api/v1/invitations', method: 'POST', headers: {
        host: 'evil.example', 'x-forwarded-host': 'evil.example', 'content-type': 'application/json',
        'content-length': Buffer.byteLength(body), authorization: `Bearer ${owner.token}`,
      } }, res => { res.resume(); resolve(res.statusCode ?? 0) })
      req.on('error', reject)
      req.end(body)
    })
    expect(status, `帶著 Host: evil.example 邀請要 201，實際 ${status}`).toBe(201)
    const link = await mailpitLink(t, e)
    expect(new URL(link).hostname, `信裡的連結是 ${link}：網址要從設定（例如 APP_URL）來，不能用請求的 Host／X-Forwarded-Host，不然攻擊者能讓你寄出指向他網站的連結、偷走 token`).not.toBe('evil.example')
  })
})
