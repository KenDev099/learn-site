// 判分測試共用的資料與工具（不是測試檔，不要改）
import type { INestApplication } from '@nestjs/common'
import type { TestingModuleBuilder } from '@nestjs/testing'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'
import { AppModule } from './src/app.module.js'
import { configureApp } from './src/app.setup.js'
import { CLOCK } from './src/clock.js'
import { PrismaService } from './src/prisma.service.js'

export const PASSWORD = 'latte-art-2026'
// PASSWORD 的 argon2id 雜湊（固定 salt 只是為了讓測試資料不用每次重算，正式資料一定要用隨機 salt）
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$Y29mZmVlLXNlZWQtc2FsdA$kttwgMTRQ0alJxGw/bAcFoUNWOS8g+BC0IGry80IOWw'

// 兩個品牌（租戶）、四間門市
export const T1 = 1, T2 = 2
export const S1 = 1, S2 = 2, S3 = 3, S4 = 4
export const U = {
  manager1: 'manager@douxiang.example',        // 1 張雅婷，豆香店長
  barista1: 'xinyi@douxiang.example',          // 2 李建國，豆香信義店
  barista2: 'daan@douxiang.example',           // 3 黃淑芬，豆香大安店
  manager2: 'manager@shanlan.example',         // 4 周文傑，山嵐店長
  barista3: 'zhongshan@shanlan.example',       // 5 吳佩珊，山嵐中山店
  wang: 'wang@example.com',                    // 6 王小明，豆香信義店的顧客
  chen: 'chen@example.com',                    // 7 陳美華，豆香大安店的顧客
  lin: 'lin@example.com',                      // 8 林志豪，山嵐中山店的顧客
}

export async function seed(prisma: PrismaService) {
  await resetDb(prisma)
  await prisma.tenant.createMany({ data: [{ name: '豆香咖啡' }, { name: '山嵐咖啡' }] })
  await prisma.store.createMany({ data: [
    { tenantId: T1, name: '豆香信義店' }, { tenantId: T1, name: '豆香大安店' },
    { tenantId: T2, name: '山嵐中山店' }, { tenantId: T2, name: '山嵐板橋店' },
  ] })
  const u = (email: string, role: string, name: string, tenantId: number, storeId: number | null, extra = {}) =>
    ({ email, role, name, tenantId, storeId, passwordHash: HASH, ...extra })
  await prisma.user.createMany({ data: [
    u(U.manager1, 'manager', '張雅婷', T1, null),
    u(U.barista1, 'barista', '李建國', T1, S1),
    u(U.barista2, 'barista', '黃淑芬', T1, S2),
    u(U.manager2, 'manager', '周文傑', T2, null),
    u(U.barista3, 'barista', '吳佩珊', T2, S3),
    u(U.wang, 'customer', '王小明', T1, S1, { phone: '0912345678', points: 120, mfaSecret: 'JBSWY3DPEHPK3PXP' }),
    u(U.chen, 'customer', '陳美華', T1, S2, { phone: '0923456789', points: 40 }),
    u(U.lin, 'customer', '林志豪', T2, S3, { phone: '0934567890', points: 300, mfaSecret: 'KRSXG5CTMVRXEZLU' }),
  ] })
  await prisma.order.createMany({ data: [
    { storeId: S1, customerId: 6, total: 190 },   // 1
    { storeId: S1, customerId: 6, total: 80 },    // 2
    { storeId: S2, customerId: 7, total: 110 },   // 3
    { storeId: S3, customerId: 8, total: 200 },   // 4
    { storeId: S4, customerId: 8, total: 70 },    // 5
  ] })
  await prisma.product.createMany({ data: [
    { tenantId: T1, name: '美式咖啡', price: 80 }, { tenantId: T1, name: '拿鐵', price: 110 },
    { tenantId: T2, name: '卡布奇諾', price: 110 }, { tenantId: T2, name: '可頌', price: 70 },
  ] })
}

// 假時鐘：clock.t 是毫秒，測試直接改它
export const START = Date.UTC(2026, 9, 31, 2, 0, 0)
export function fakeClock() {
  const clock = { t: START, now: () => clock.t }
  return clock
}

export async function makeApp(override: (b: TestingModuleBuilder) => TestingModuleBuilder = b => b) {
  const clock = fakeClock()
  const app = await createTestApp(AppModule, {
    override: b => override(b.overrideProvider(CLOCK).useValue(clock)),
    configure: configureApp,
  })
  const prisma = app.get(PrismaService)
  return { app, clock, prisma, http: () => request(app.getHttpServer()) }
}

// 從 Set-Cookie 取出某個 cookie（supertest 不會保存 Secure cookie，測試自己帶）
export function cookieOf(res: request.Response, name: string) {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find(c => c.startsWith(`${name}=`))
  return raw?.split(';')[0].slice(name.length + 1)
}

export async function login(app: INestApplication, email: string, password = PASSWORD) {
  const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password })
  if (res.status !== 200) throw new Error(`測試用帳號 ${email} 登入失敗（${res.status}）：登入流程被改壞了嗎？${JSON.stringify(res.body)}`)
  return { access: res.body.accessToken as string, refresh: cookieOf(res, '__Secure-rt') as string }
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })
