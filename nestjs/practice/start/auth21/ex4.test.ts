// 練習 4：訂單的物件層級授權（E2E）
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

let app: INestApplication, prisma: any, http: any, wang: string
const token = async (email: string) => (await request(http).post('/auth/login').send({ email, password: PASSWORD })).body.accessToken as string
const get = (path: string, t = wang) => request(http).get(path).set('Authorization', `Bearer ${t}`)
const cancel = (id: number, t = wang) => request(http).patch(`/orders/${id}/cancel`).set('Authorization', `Bearer ${t}`)

beforeAll(async () => {
  app = await makeApp()
  http = app.getHttpServer()
  prisma = app.get(PrismaService)
  await seed(prisma)
  wang = await token('wang@coffee.example')
})
afterAll(() => app?.close())

describe('練習 4：顧客只能存取自己的訂單', () => {
  it('讀別人的訂單 → 404，回應跟不存在的訂單完全相同', async () => {
    const mine = await get('/orders/3')
    expect(mine.status, `王小明讀自己的訂單 #3 要 200（得到 ${mine.status}）`).toBe(200)
    expect(mine.body.id, '要回傳訂單 #3').toBe(3)
    const others = await get('/orders/2')
    const missing = await get('/orders/999')
    expect(others.status, '王小明讀陳美華的訂單 #2 要 404：不是你的就當作不存在，不要回 403（會洩漏訂單存在）').toBe(404)
    expect(others.body, '別人的訂單與不存在的訂單，回應 body 要一模一樣').toEqual(missing.body)
  })

  it('GET /orders 只列出自己的訂單；店員沒有「我的訂單」', async () => {
    const res = await get('/orders')
    expect(res.body.map((o: { id: number }) => o.id), 'GET /orders 只能有王小明的訂單 #1、#3：where 要加上 customerId').toEqual([1, 3])
    const barista = await token('lin@coffee.example')
    const staff = await get('/orders', barista)
    expect([staff.status, staff.body], '店員的 customerId 是 null，GET /orders 要回空陣列：小心 customerId: undefined 會讓 Prisma 拿掉這個條件、查出全部').toEqual([200, []])
    const one = await get('/orders/1', barista)
    expect(one.status, '店員 GET /orders/1 要 404：findMineById 也不能讓 customerId: undefined 拿掉條件').toBe(404)
    const other = await cancel(1, barista)
    expect(other.status, '店員 PATCH /orders/1/cancel 要 404：cancelMine 也要有擁有者條件').toBe(404)
  })

  it('取消別人的訂單 → 404，資料庫裡的狀態不變；取消自己的成功', async () => {
    const res = await cancel(2)
    expect(res.status, '王小明取消陳美華的訂單 #2 要 404：PATCH /orders/:id/cancel 也要檢查擁有者').toBe(404)
    expect((await prisma.order.findUnique({ where: { id: 2 } })).status, '別人的訂單 #2 狀態要維持 pending').toBe('pending')
    const ok = await cancel(1)
    expect([ok.status, ok.body.status], '取消自己的訂單 #1 要 200，狀態變成 cancelled').toEqual([200, 'cancelled'])
  })
})
