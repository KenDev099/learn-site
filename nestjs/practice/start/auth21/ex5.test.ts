// 練習 5：refresh token 輪替、重用偵測、HttpOnly cookie 與 CSRF 檢查（E2E）
// 測試環境不會替你保存 Secure cookie：自己解析 Set-Cookie，再手動帶 Cookie 標頭
import { argon2Sync, createHash, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Module, type INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { TestingModuleBuilder } from '@nestjs/testing'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'
import { AppModule } from './src/app.module.js'
import { configureApp } from './src/app.setup.js'
import { CLOCK } from './src/clock.js'
import { PrismaService } from './src/prisma.service.js'

// ---- 每個測試檔共用的準備：測試資料、假時鐘、測試用的 app ----
const PASSWORD = 'latte-110-please'
const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '')
function phc(password: string) {
  const salt = randomBytes(16)
  const hash = argon2Sync('argon2id', { message: password, nonce: salt, tagLength: 32, memory: 19456, passes: 2, parallelism: 1 })
  return `$argon2id$v=19$m=19456,t=2,p=1$${b64(salt)}$${b64(hash)}`
}
// 顧客 1 王小明（訂單 1、3）、顧客 2 陳美華（訂單 2）；林志豪是吧台、張雅婷是店長、李建國已停用
async function seed(prisma: any) {
  await resetDb(prisma)
  await prisma.customer.createMany({ data: [{ name: '王小明' }, { name: '陳美華' }] })
  await prisma.product.createMany({ data: [{ name: '美式咖啡', price: 80 }, { name: '拿鐵', price: 110 }] })
  const passwordHash = phc(PASSWORD)
  await prisma.user.createMany({ data: [
    { email: 'wang@coffee.example', passwordHash, role: 'customer', customerId: 1 },
    { email: 'chen@coffee.example', passwordHash, role: 'customer', customerId: 2 },
    { email: 'lin@coffee.example', passwordHash, role: 'barista' },
    { email: 'zhang@coffee.example', passwordHash, role: 'manager' },
    { email: 'li@coffee.example', passwordHash, role: 'customer', disabledAt: new Date() },
  ] })
  await prisma.order.createMany({ data: [{ customerId: 1, total: 190 }, { customerId: 2, total: 110 }, { customerId: 1, total: 80 }] })
}
const START = Date.now() - 5 * 60_000   // 假時鐘比真實時間慢 5 分鐘：iat 用了真實時間就看得出來
const clock = { t: START, now() { return this.t } }
async function makeApp(controllers: any[] = [], override = (b: TestingModuleBuilder) => b) {
  @Module({ imports: [AppModule], controllers })
  class TestModule {}
  return createTestApp(TestModule, { override: b => override(b.overrideProvider(CLOCK).useValue(clock)), configure: configureApp })
}
const claims = (token: string, i = 1) => JSON.parse(Buffer.from(token.split('.')[i], 'base64url').toString())
// ---- 共用的準備到這裡 ----

type Cookie = { name: string; value: string; attrs: Record<string, string | true> }
function rtCookie(res: request.Response): Cookie | undefined {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
  for (const line of raw) {
    const [pair, ...rest] = line.split(';').map(s => s.trim())
    const i = pair.indexOf('=')
    const name = pair.slice(0, i)
    if (!/-rt$/.test(name)) continue
    const attrs: Record<string, string | true> = {}
    for (const a of rest) { const j = a.indexOf('='); attrs[(j < 0 ? a : a.slice(0, j)).toLowerCase()] = j < 0 ? true : a.slice(j + 1) }
    return { name, value: decodeURIComponent(pair.slice(i + 1)), attrs }
  }
}

let app: INestApplication, prisma: any, http: any
const login = async (email = 'wang@coffee.example') => {
  const res = await request(http).post('/auth/login').send({ email, password: PASSWORD })
  expect(res.status, '先完成練習 2 的登入').toBe(200)
  const c = rtCookie(res)
  expect(c, '登入的回應要用 Set-Cookie 送出 refresh token 的 cookie（名稱 __Secure-rt）').toBeDefined()
  return c!
}
const refresh = (value: string, headers: Record<string, string> = {}) =>
  request(http).post('/auth/refresh').set({ Cookie: `__Secure-rt=${value}`, ...headers })

beforeAll(async () => {
  app = await makeApp()
  http = app.getHttpServer()
  prisma = app.get(PrismaService)
  await seed(prisma)
})
afterAll(() => app?.close())

describe('練習 5：refresh token', () => {
  it('登入時發 refresh cookie：__Secure-rt、HttpOnly、Secure、SameSite=Strict、Path=/auth、14 天', async () => {
    const c = await login()
    expect(c.name, 'cookie 名稱要是 __Secure-rt（Path 不是 /，不能用 __Host-）').toBe('__Secure-rt')
    expect(c.attrs.httponly, '要有 HttpOnly：前端 JavaScript 讀不到，XSS 偷不走').toBe(true)
    expect(c.attrs.secure, '要有 Secure').toBe(true)
    expect(String(c.attrs.samesite).toLowerCase(), '要有 SameSite=Strict').toBe('strict')
    expect(c.attrs.path, 'Path 要是 /auth：只有 /auth/refresh、/auth/logout 收得到').toBe('/auth')
    expect(c.attrs['max-age'], '期限 14 天（res.cookie 的 maxAge 單位是毫秒）').toBe(String(14 * 24 * 3600))
    expect(c.value.length, 'token 要是 32 bytes 的隨機值（base64url 是 43 個字元）').toBeGreaterThanOrEqual(43)
  })

  it('資料庫只存 SHA-256，沒有原始 token', async () => {
    const c = await login('chen@coffee.example')
    const rows = await prisma.refreshToken.findMany({ where: { user: { email: 'chen@coffee.example' } } })
    expect(rows.length, '登入後 RefreshToken 表要有這一張 token').toBeGreaterThan(0)
    const digest = createHash('sha256').update(c.value).digest()
    const forms = [digest.toString('hex'), digest.toString('base64url'), digest.toString('base64')]
    for (const row of rows) {
      expect(JSON.stringify(row), '資料庫裡不能有原始的 refresh token').not.toContain(c.value)
    }
    expect(rows.some((r: any) => forms.includes(r.tokenHash)), 'tokenHash 要是 token 的 SHA-256').toBe(true)
  })

  it('refresh 成功：發新的 access token 與新的 cookie', async () => {
    const c = await login()
    const res = await refresh(c.value)
    expect(res.status, `POST /auth/refresh 帶有效的 cookie 要 200（得到 ${res.status} ${JSON.stringify(res.body)}）`).toBe(200)
    const me = await request(http).get('/me').set('Authorization', `Bearer ${res.body.accessToken}`)
    expect(me.status, 'refresh 回傳的 { accessToken } 要能用').toBe(200)
    const next = rtCookie(res)
    expect(next?.value, 'refresh 要用 Set-Cookie 換一張新的 refresh token（輪替）').toBeDefined()
    expect(next!.value, '新的 refresh token 不能跟舊的一樣').not.toBe(c.value)
    expect([next!.name, next!.attrs.path, next!.attrs.httponly], '新 cookie 的名稱與屬性跟登入時相同').toEqual(['__Secure-rt', '/auth', true])
  })

  it('重用偵測：舊的 refresh token 再出現 → 401，而且整個家族作廢（最新的也不能用）', async () => {
    const c1 = await login()
    const r1 = await refresh(c1.value)
    const c2 = rtCookie(r1)!
    const reuse = await refresh(c1.value)
    expect(reuse.status, '已經用過的 refresh token 再拿來用要 401').toBe(401)
    const after = await refresh(c2.value)
    expect(after.status, '偵測到重用後，同一個家族最新的 token 也要失效：用過的 token 不能刪掉，要留著 usedAt 才認得出重用').toBe(401)
  })

  it('過期：14 天後的 refresh token → 401', async () => {
    const c = await login()
    clock.t = START + 14 * 24 * 3600_000 + 60_000
    try {
      const res = await refresh(c.value)
      expect(res.status, '超過 expiresAt 的 refresh token 要 401：搶用的條件要包含 expiresAt: { gt: now }，now 用注入的時鐘').toBe(401)
    } finally { clock.t = START }
  })

  it('logout：撤銷家族，用同樣的名稱與 Path 清掉 cookie', async () => {
    const c = await login()
    const out = await request(http).post('/auth/logout').set('Cookie', `__Secure-rt=${c.value}`)
    expect(out.status, `POST /auth/logout 要成功（得到 ${out.status}）`).toBeLessThan(300)
    const cleared = rtCookie(out)
    expect(cleared?.name, 'logout 要送出同名的 Set-Cookie 清掉 __Secure-rt').toBe('__Secure-rt')
    expect(cleared!.attrs.path, '清 cookie 要用一樣的 Path=/auth，不然瀏覽器會當成另一個 cookie').toBe('/auth')
    const gone = cleared!.attrs['max-age'] === '0' || (typeof cleared!.attrs.expires === 'string' && Date.parse(cleared!.attrs.expires) < Date.now())
    expect(gone, '清掉的 cookie 要 Max-Age=0（或過去的 Expires）').toBe(true)
    expect((await refresh(c.value)).status, 'logout 之後舊的 refresh token 要 401').toBe(401)
  })

  it('CSRF：跨站、同站但不在信任清單 → 403；信任的前台、沒有瀏覽器標頭的 POS App → 200', async () => {
    const shop = app.get(ConfigService).getOrThrow<string>('CORS_ORIGINS').split(',')[0]
    const cases: [Record<string, string>, number, string][] = [
      [{ 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' }, 403, 'Sec-Fetch-Site: cross-site、Origin: https://evil.example'],
      [{ 'Sec-Fetch-Site': 'same-site', Origin: 'https://marketing.coffee.example' }, 403, 'Sec-Fetch-Site: same-site、Origin 是不在信任清單的子網域'],
      [{ 'Sec-Fetch-Site': 'same-site', Origin: shop }, 200, `Sec-Fetch-Site: same-site、Origin 是信任的前台 ${shop}`],
      [{ 'Sec-Fetch-Site': 'same-origin' }, 200, 'Sec-Fetch-Site: same-origin'],
      [{ 'Sec-Fetch-Site': 'cross-site', Origin: `${shop}.evil.example` }, 403, `Sec-Fetch-Site: cross-site、Origin 是 ${shop}.evil.example（開頭相同不算，要完全相等）`],
      [{ Origin: 'https://evil.example' }, 403, '沒有 Sec-Fetch-Site、Origin 是 https://evil.example'],
      [{}, 200, '沒有 Fetch Metadata 也沒有 Origin（POS App）'],
    ]
    for (const [headers, status, label] of cases) {
      const c = await login()
      const res = await refresh(c.value, headers)
      expect(res.status, `${label} → 要 ${status}（得到 ${res.status}）`).toBe(status)
    }
  })
})

describe('練習 5：同時兩個 refresh', () => {
  let raceApp: INestApplication, url: string
  beforeAll(async () => {
    // 每次讀 refresh token：先讀，再等另一個請求也讀完（最多等 300 ms）才回傳。
    // 「先讀再寫」的寫法一定會兩個請求都讀到「還沒用過」
    let waiting: (() => void)[] = []
    const slow = async ({ args, query }: any) => {
      const result = await query(args)
      await new Promise<void>(resolve => {
        waiting.push(resolve)
        if (waiting.length >= 2) { waiting.forEach(r => r()); waiting = [] }
        else setTimeout(() => { waiting = waiting.filter(r => r !== resolve); resolve() }, 300)
      })
      return result
    }
    raceApp = await makeApp([], b => b.overrideProvider(PrismaService).useFactory({
      inject: [ConfigService],
      factory: (config: ConfigService) => new PrismaService(config).$extends({ query: { refreshToken: { findUnique: slow, findFirst: slow, findMany: slow } } }),
    }))
    await raceApp.listen(0, '127.0.0.1')
    url = await raceApp.getUrl()
  })
  afterAll(async () => { await raceApp?.close() })

  it('同一張 refresh token 同時送兩次 → 剛好一個 200', async () => {
    const res = await request(url).post('/auth/login').send({ email: 'wang@coffee.example', password: PASSWORD })
    const c = rtCookie(res)
    expect(c, '先完成登入時發 cookie').toBeDefined()
    const both = await Promise.all([1, 2].map(() => request(url).post('/auth/refresh').set('Cookie', `__Secure-rt=${c!.value}`)))
    expect(both.map(r => r.status).sort(), '兩個同時到的 refresh 只能有一個成功：用 updateMany({ where: { tokenHash, usedAt: null }, … }) 的 count 判斷誰搶到').toEqual([200, 401])
  })
})
