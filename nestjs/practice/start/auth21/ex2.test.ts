// 練習 2：JwtModule、登入、全域 JwtAuthGuard 與 @Public()（E2E）
import { createHmac, argon2Sync, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Controller, Get, Module, type INestApplication } from '@nestjs/common'
import type { TestingModuleBuilder } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'
import { AppModule } from './src/app.module.js'
import { configureApp } from './src/app.setup.js'
import { CLOCK } from './src/clock.js'
import { PrismaService } from './src/prisma.service.js'
import { PasswordService } from './src/auth/password.service.js'
import { RequirePermissions } from './src/auth/permissions.decorator.js'
import { CurrentUser } from './src/auth/principal.js'

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

// 測試另外掛的 controller：一個什麼裝飾器都沒有，一個宣告「登入就可以」
@Controller('probe')
class ProbeController {
  @Get('open') open() { return { leaked: true } }
  @RequirePermissions() @Get('whoami') whoami(@CurrentUser() user: unknown) { return user }
}

let app: INestApplication, prisma: any, http: any, secret: string, iss: string, aud: string
const login = (email: string, password = PASSWORD) => request(http).post('/auth/login').send({ email, password })
const sign = (header: object, payload: object, key = secret, alg = 'sha256') => {
  const data = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`
  return `${data}.${createHmac(alg, key).update(data).digest('base64url')}`
}
const now = () => Math.floor(clock.t / 1000)
const good = () => ({ sub: '1', ver: 0, iat: now(), exp: now() + 900, iss, aud })
const whoami = (token: string) => request(http).get('/probe/whoami').set('Authorization', `Bearer ${token}`)

beforeAll(async () => {
  app = await makeApp([ProbeController])
  http = app.getHttpServer()
  prisma = app.get(PrismaService)
  await seed(prisma)
  const config = app.get(ConfigService)
  secret = config.getOrThrow('JWT_SECRET'); iss = config.getOrThrow('JWT_ISSUER'); aud = config.getOrThrow('JWT_AUDIENCE')
})
afterAll(() => app?.close())

describe('練習 2：登入與全域認證 guard', () => {
  it('登入成功拿到 access token：HS256、iss、aud、15 分鐘、iat 用注入的時鐘、payload 沒有角色', async () => {
    clock.t = START
    const res = await login('wang@coffee.example')
    expect(res.status, `POST /auth/login 正確的帳密要回 200（得到 ${res.status} ${JSON.stringify(res.body)}）`).toBe(200)
    const token = res.body.accessToken
    expect(token, '回應要是 { accessToken }').toBeTypeOf('string')
    expect(claims(token, 0).alg, 'signOptions 要固定 algorithm: \'HS256\'').toBe('HS256')
    const c = claims(token)
    expect(c.iss, 'signOptions 要設 issuer（JWT_ISSUER）').toBe(iss)
    expect(c.aud, 'signOptions 要設 audience（JWT_AUDIENCE）').toBe(aud)
    expect(c.iat, 'iat 要由注入的 Clock 決定：payload 帶 iat: Math.floor(clock.now() / 1000)').toBe(now())
    expect(c.exp - c.iat, 'access token 的期限是 15 分鐘（900 秒）').toBe(900)
    expect(Object.keys(c).sort(), 'payload 只放 sub 與 ver（加上 iat、exp、iss、aud），不放角色').toEqual(['aud', 'exp', 'iat', 'iss', 'sub', 'ver'])
    expect([c.sub, c.ver], 'sub 是使用者 id 的字串、ver 是 tokenVersion').toEqual(['1', 0])
    const me = await whoami(token)
    expect(me.status, '拿登入得到的 token 呼叫需要登入的路由要成功').toBe(200)
  })

  it('email 不存在、密碼錯、帳號停用：回應完全相同，而且都有驗一次密碼', async () => {
    const verify = vi.spyOn(app.get(PasswordService), 'verify')
    const unknown = await login('nobody@coffee.example')
    expect(verify, 'email 不存在時也要呼叫一次 passwords.verify（拿一個假的雜湊驗），回應時間才不會洩漏帳號存不存在').toHaveBeenCalled()
    const wrong = await login('wang@coffee.example', 'wrong-password')
    const disabled = await login('li@coffee.example')
    expect(unknown.status, '登入失敗要回 401').toBe(401)
    expect(wrong.body, 'email 不存在與密碼錯誤的回應 body 要一模一樣').toEqual(unknown.body)
    expect([disabled.status, disabled.body], '停用的帳號就算密碼對也是同樣的 401 回應').toEqual([401, unknown.body])
  })

  it('沒帶 token、竄改、alg: none、錯的 aud、錯的 iss、換成 HS512 → 401', async () => {
    clock.t = START
    const none = await request(http).get('/probe/whoami')
    expect(none.status, '沒帶 token 要回 401').toBe(401)
    expect(none.headers['www-authenticate'], '401 要帶 WWW-Authenticate: Bearer（RFC 9110）').toMatch(/^Bearer/)
    expect((await whoami(sign({ alg: 'HS256', typ: 'JWT' }, good()))).status, '用正確的秘密與設定自己簽的 token 應該要通過（測試的對照組）').toBe(200)
    const token = (await login('wang@coffee.example')).body.accessToken as string
    const [h, , s] = token.split('.')
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...claims(token), sub: '2' })).toString('base64url')}.${s}`
    expect((await whoami(forged)).status, '改了 payload 的 token 要回 401').toBe(401)
    const algNone = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${token.split('.')[1]}.`
    expect((await whoami(algNone)).status, 'alg: none 的 token 要回 401').toBe(401)
    expect((await whoami(sign({ alg: 'HS256', typ: 'JWT' }, { ...good(), aud: 'https://pos.coffee.example' }))).status, '同一把秘密簽、但 aud 不同的 token 要回 401：verifyOptions 要設 audience').toBe(401)
    expect((await whoami(sign({ alg: 'HS256', typ: 'JWT' }, { ...good(), iss: 'https://evil.example' }))).status, 'iss 不同的 token 要回 401：verifyOptions 要設 issuer').toBe(401)
    expect((await whoami(sign({ alg: 'HS512', typ: 'JWT' }, good(), secret, 'sha512'))).status, 'HS512 的 token 要回 401：verifyOptions 要設 algorithms: [\'HS256\']').toBe(401)
  })

  it('過期：exp 已過的 token、假時鐘往前推 16 分鐘後的 token → 401', async () => {
    clock.t = START
    expect((await whoami(sign({ alg: 'HS256', typ: 'JWT' }, { ...good(), iat: now() - 1000, exp: now() - 100 }))).status, 'exp 已經過了的 token 要回 401（不要設 ignoreExpiration）').toBe(401)
    const token = (await login('wang@coffee.example')).body.accessToken
    expect((await whoami(token)).status, '剛登入的 token 要能用').toBe(200)
    clock.t = START + 16 * 60_000
    try {
      expect((await whoami(token)).status, '時鐘往前 16 分鐘後 token 要過期：verifyAsync 要傳 clockTimestamp: Math.floor(clock.now() / 1000)').toBe(401)
    } finally { clock.t = START }
  })

  it('tokenVersion 加 1 或帳號停用後，舊 token → 401', async () => {
    clock.t = START
    const token = (await login('chen@coffee.example')).body.accessToken
    expect((await whoami(token)).status, '剛登入的 token 要能用').toBe(200)
    await prisma.user.update({ where: { email: 'chen@coffee.example' }, data: { tokenVersion: { increment: 1 } } })
    expect((await whoami(token)).status, 'tokenVersion 加 1 之後，ver 不同的舊 token 要回 401').toBe(401)
    const fresh = (await login('chen@coffee.example')).body.accessToken
    expect((await whoami(fresh)).status, '重新登入拿到的新 token 要能用').toBe(200)
    await prisma.user.update({ where: { email: 'chen@coffee.example' }, data: { disabledAt: new Date() } })
    expect((await whoami(fresh)).status, '帳號停用後，原本的 token 要回 401').toBe(401)
    await prisma.user.update({ where: { email: 'chen@coffee.example' }, data: { disabledAt: null, tokenVersion: 0 } })
  })

  it('request.user 是資料庫的最新狀態', async () => {
    clock.t = START
    const token = (await login('wang@coffee.example')).body.accessToken
    const before = await whoami(token)
    expect(before.body, 'request.user 要是 { id, email, role, customerId }').toEqual({ id: 1, email: 'wang@coffee.example', role: 'customer', customerId: 1 })
    await prisma.user.update({ where: { id: 1 }, data: { role: 'barista' } })
    try {
      expect((await whoami(token)).body.role, '角色改了之後，同一個 token 的下一個請求要看到新角色：guard 每次用 sub 查資料庫').toBe('barista')
    } finally { await prisma.user.update({ where: { id: 1 }, data: { role: 'customer' } }) }
  })

  it('預設必須登入：@Public() 的 GET /menu 不用 token，沒有裝飾器的新 controller 要 401', async () => {
    const menu = await request(http).get('/menu')
    expect(menu.status, 'GET /menu 有 @Public()，不帶 token 要 200').toBe(200)
    const open = await request(http).get('/probe/open')
    expect(open.status, '測試另外掛的 controller 沒有任何裝飾器，不帶 token 要 401：JwtAuthGuard 要註冊成 APP_GUARD，不是在個別 controller 用 @UseGuards').toBe(401)
  })
})
