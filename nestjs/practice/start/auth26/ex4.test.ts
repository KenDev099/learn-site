// 練習 4：忘記密碼流程（第 16 課）
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Mailer } from './src/mailer.js'
import { bearer, login, makeApp, seed, U } from './test-fixtures.ts'

let ctx: Awaited<ReturnType<typeof makeApp>>
let mailer: Mailer
const NEW_PASSWORD = 'oat-milk-flat-white-2026'
beforeAll(async () => {
  ctx = await makeApp()
  mailer = ctx.app.get(Mailer)
})
beforeEach(async () => {
  await seed(ctx.prisma)
  mailer.sent.length = 0
})
afterAll(() => ctx?.app.close())

const ask = (email: string, host = 'api.coffee.example') => ctx.http().post('/password-reset/request').set('Host', host).send({ email })
const confirm = (token: string, password = NEW_PASSWORD) => ctx.http().post('/password-reset/confirm').send({ token, password })
function linkFromMail() {
  expect(mailer.sent, '要寄出一封重設密碼的信（Mailer.send）').toHaveLength(1)
  const link = /https?:\/\/\S+/.exec(mailer.sent[0].text)?.[0] ?? ''
  return { link, token: new URL(link).searchParams.get('token') ?? '' }
}

describe('練習 4：重設密碼', () => {
  it('攻擊：存在與不存在的 email，回應完全相同', async () => {
    const yes = await ask(U.wang)
    const no = await ask('nobody@example.com')
    expect(no.status, '沒註冊的 email 也要回跟有註冊時一樣的狀態碼，不能讓人用這支 API 查誰是會員').toBe(yes.status)
    expect(no.body, '回應的內容也要完全一樣').toEqual(yes.body)
    expect(yes.status, '申請本身要成功（2xx）').toBeLessThan(300)
    expect(mailer.sent.map(m => m.to), '只有存在的帳號會收到信').toEqual([U.wang])
  })

  it('攻擊：Host 標頭是 evil.example，信裡的連結仍然是 APP_URL', async () => {
    await ask(U.wang, 'evil.example')
    const { link } = linkFromMail()
    expect(link.startsWith(`${process.env.APP_URL}/`), `連結要用設定檔的 APP_URL（${process.env.APP_URL}）組成，不能用請求的 Host 標頭；現在是 ${link}`).toBe(true)
  })

  it('攻擊：資料庫只存 token 的雜湊', async () => {
    await ask(U.wang)
    const { token } = linkFromMail()
    const rows = await ctx.prisma.passwordReset.findMany()
    expect(rows, '要在 password_resets 新增一筆').toHaveLength(1)
    expect(rows[0].tokenHash, '資料庫外洩時，拿到的值不能直接拿去重設密碼：存 SHA-256，不存原始 token').not.toBe(token)
    expect(rows[0].tokenHash, '用 SHA-256（hex）').toBe(createHash('sha256').update(token).digest('hex'))
  })

  it('功能＋攻擊：重設成功後，新密碼可以登入，舊的 access 與 refresh token 全部失效', async () => {
    const before = await login(ctx.app, U.wang)
    await ask(U.wang)
    const { token } = linkFromMail()
    expect((await confirm(token)).status, '用信裡的 token 設定新密碼要成功（204）').toBe(204)
    await login(ctx.app, U.wang, NEW_PASSWORD)
    expect((await ctx.http().get('/me').set(bearer(before.access))).status,
      '重設前發出的 access token 要立刻失效：把 tokenVersion 加 1（第 11 課），不然偷到 token 的人還能用到過期').toBe(401)
    expect((await ctx.http().post('/auth/refresh').set('Cookie', `__Secure-rt=${before.refresh}`)).status,
      '重設前的 refresh token 也要撤銷：會來重設密碼，可能就是帳號被別人登入了').toBe(401)
  })

  it('攻擊：同一個 token 第二次使用 → 失敗', async () => {
    await ask(U.wang)
    const { token } = linkFromMail()
    expect((await confirm(token)).status).toBe(204)
    expect((await confirm(token, 'another-long-password-123')).status, 'token 只能用一次，第二次要 400').toBe(400)
    await login(ctx.app, U.wang, NEW_PASSWORD)
  })

  it('攻擊：30 分鐘後 token 失效', async () => {
    await ask(U.wang)
    const { token } = linkFromMail()
    ctx.clock.t += 30 * 60 * 1000 + 1000
    try {
      expect((await confirm(token)).status, '過了 30 分鐘的 token 要 400：比對 expiresAt 與 Clock 的現在時間').toBe(400)
    } finally {
      ctx.clock.t -= 30 * 60 * 1000 + 1000
    }
    await login(ctx.app, U.wang)   // 舊密碼仍然有效
  })
})
