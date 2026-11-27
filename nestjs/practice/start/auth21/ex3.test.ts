// 練習 3：@RequirePermissions() 與全域 PermissionsGuard（E2E）
import { argon2Sync, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Controller, Get, Module, type INestApplication } from '@nestjs/common'
import type { TestingModuleBuilder } from '@nestjs/testing'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'
import { AppModule } from './src/app.module.js'
import { configureApp } from './src/app.setup.js'
import { CLOCK } from './src/clock.js'
import { PrismaService } from './src/prisma.service.js'
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

// 測試另外掛的 controller：export 只要登入（JwtAuthGuard 會過）但沒有宣告任何權限；both 同時要兩個權限
@Controller('probe')
class ProbeController {
  @Get('export') exportAll(@CurrentUser() user: unknown) { return { leaked: true, user } }
  @RequirePermissions('order:read', 'order:refund') @Get('both') both() { return { ok: true } }
}

let app: INestApplication, prisma: any, http: any
const token = async (email: string) => (await request(http).post('/auth/login').send({ email, password: PASSWORD })).body.accessToken as string
const as = (t: string) => ({ Authorization: `Bearer ${t}` })

beforeAll(async () => {
  app = await makeApp([ProbeController])
  http = app.getHttpServer()
  prisma = app.get(PrismaService)
  await seed(prisma)
})
afterAll(() => app?.close())

describe('練習 3：權限 guard', () => {
  it('吧台退款 → 403；店長退款 → 200；沒登入 → 401（先認證、再授權）', async () => {
    const barista = await token('lin@coffee.example')
    const denied = await request(http).post('/orders/1/refund').set(as(barista))
    expect(denied.status, '吧台（barista）沒有 order:refund，要回 403').toBe(403)
    const manager = await token('zhang@coffee.example')
    const ok = await request(http).post('/orders/2/refund').set(as(manager))
    expect(ok.status, `店長（manager）透過繼承有 order:refund，要回 200（得到 ${ok.status}）`).toBe(200)
    expect((await prisma.order.findUnique({ where: { id: 2 } })).status, '退款成功後訂單狀態是 refunded').toBe('refunded')
    expect((await request(http).post('/orders/1/refund')).status, '沒帶 token 要 401 而不是 403：PermissionsGuard 要註冊在 JwtAuthGuard 之後').toBe(401)
  })

  it('有宣告的路由照常運作：顧客 GET /orders、GET /me、公開的 GET /menu', async () => {
    const customer = await token('wang@coffee.example')
    expect((await request(http).get('/orders').set(as(customer))).status, '顧客有 order:read，GET /orders 要 200').toBe(200)
    const me = await request(http).get('/me').set(as(customer))
    expect(me.status, 'GET /me 用 @RequirePermissions() 宣告「登入就可以」，要 200：空陣列代表不需要特定權限').toBe(200)
    expect((await request(http).get('/menu')).status, '@Public() 的 GET /menu 要放行：PermissionsGuard 也要讀 IS_PUBLIC_KEY').toBe(200)
  })

  it('沒有宣告權限的路由一律 403（預設拒絕）', async () => {
    const manager = await token('zhang@coffee.example')
    const res = await request(http).get('/probe/export').set(as(manager))
    expect(res.status, '測試另外掛的路由沒有 @RequirePermissions 也沒有 @Public，就算是店長也要 403').toBe(403)
  })

  it('宣告了好幾個權限時，每一個都要有', async () => {
    const barista = await token('lin@coffee.example')
    expect((await request(http).get('/probe/both').set(as(barista))).status, '路由宣告 order:read 與 order:refund，吧台只有 order:read，要 403：每個權限都要有（every），不是有一個就好').toBe(403)
    const manager = await token('zhang@coffee.example')
    expect((await request(http).get('/probe/both').set(as(manager))).status, '店長兩個權限都有，要 200').toBe(200)
  })

  it('權限以資料庫為準：店長被降成吧台後，同一個 token 的下一個請求 → 403', async () => {
    const t = await token('zhang@coffee.example')
    expect((await request(http).post('/orders/1/refund').set(as(t))).status, '降權前店長可以退款').toBe(200)
    await prisma.user.update({ where: { email: 'zhang@coffee.example' }, data: { role: 'barista' } })
    try {
      expect((await request(http).post('/orders/3/refund').set(as(t))).status, '降成吧台後要 403：權限要用 request.user.role（guard 剛從資料庫讀的），不能讀 token 裡的角色').toBe(403)
      await prisma.user.update({ where: { email: 'zhang@coffee.example' }, data: { role: 'owner2' } })
      expect((await request(http).get('/orders').set(as(t))).status, '資料庫裡出現程式不認得的角色 owner2：沒有任何權限，要 403').toBe(403)
    } finally {
      await prisma.user.update({ where: { email: 'zhang@coffee.example' }, data: { role: 'manager' } })
    }
  })
})
