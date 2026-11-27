// 練習 1：用 order.paid 事件打破 orders ↔ loyalty 的循環依賴
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter'
import request from 'supertest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './src/generated/prisma/client.js'
import { AppModule } from './src/app.module.js'
import { LoyaltyModule } from './src/loyalty/loyalty.module.js'
import { OrderPaidEvent } from './src/orders/events/order-paid.event.js'
import { PrismaModule } from './src/prisma/prisma.module.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'
import { build, start } from '../../helpers/server.ts'

const SRC = join(import.meta.dirname, 'src')
const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.startsWith('generated/'))
  .map(f => join(SRC, f))
const code = new Map(files.map(f => [f, readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '')]))
const rel = (f: string) => relative(SRC, f)
const under = (folder: string) => (f: string) => rel(f).startsWith(folder + '/')
function importsOf(file: string, { types = true } = {}) {
  const found: string[] = []
  for (const m of code.get(file)!.matchAll(/(?:import|export)\s+(type\s+)?[^'"]*?from\s*['"](\.[^'"]+)['"]|import\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
    if (m[1] && !types) continue
    found.push(resolve(dirname(file), m[2] ?? m[3]).replace(/\.js$/, '.ts'))
  }
  return found
}
// 從一個檔案沿著 import 走得到的所有 src 檔案（re-export 也算：barrel 轉手的東西照樣被依賴）
function reachable(from: string) {
  const seen = new Set<string>(), stack = [from]
  while (stack.length) for (const t of importsOf(stack.pop()!)) if (code.has(t) && !seen.has(t)) { seen.add(t); stack.push(t) }
  return [...seen]
}
// 碰 loyalty 的資料表：.stampCard、['stampCard']、原生 SQL 裡的 stamp_cards 都算
const LOYALTY_TABLES = /\.\s*(stampCard|pointTransaction)\b|\[\s*['"`](stampCard|pointTransaction)['"`]\s*\]|\b(stamp_cards|point_transactions)\b/
function findCycle() {
  const done = new Set<string>(), path: string[] = []
  const visit = (f: string): string[] | undefined => {
    if (path.includes(f)) return [...path.slice(path.indexOf(f)), f]
    if (done.has(f) || !code.has(f)) return
    path.push(f)
    for (const next of importsOf(f, { types: false })) { const c = visit(next); if (c) return c }
    path.pop(); done.add(f)
  }
  for (const f of files) { const c = visit(f); if (c) return c.map(rel).join(' → ') }
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
beforeEach(async () => {
  await resetDb(db)
  await db.product.createMany({ data: [{ name: '美式咖啡', price: 80 }, { name: '拿鐵', price: 110 }, { name: '起司蛋糕', price: 120 }] })
})
afterAll(() => db.$disconnect())
const points = async (customerId: number) =>
  (await db.pointTransaction.aggregate({ where: { card: { customerId } }, _sum: { points: true } }))._sum.points ?? 0

describe('練習 1：架構規則', () => {
  it('src 裡沒有 forwardRef', () => {
    const bad = files.filter(f => /forwardRef\s*\(/.test(code.get(f)!)).map(rel)
    expect(bad, 'forwardRef 只是讓循環依賴撐得住，循環本身還在。拿掉它，改成 orders 發 order.paid、loyalty 訂閱').toEqual([])
  })

  it('src 裡沒有循環 import', () => {
    expect(findCycle(), '這些檔案互相 import（ESM 循環：Vitest 會過，nest build 之後 node dist/main.js 會在啟動時 ReferenceError）').toBeUndefined()
  })

  it('src/orders 不 import src/loyalty', () => {
    const bad = files.filter(under('orders')).flatMap(f => importsOf(f).filter(under('loyalty')).map(t => `${rel(f)} → ${rel(t)}`))
    expect(bad, 'orders 不能認識 loyalty：付款只 emit order.paid，誰要加點自己來聽').toEqual([])
  })

  it('src/loyalty 只從 src/orders/events/ import（間接的也算）', () => {
    const bad = files.filter(under('loyalty')).flatMap(f => reachable(f).filter(t => under('orders')(t) && !under('orders/events')(t)).map(t => `${rel(f)} ⇢ ${rel(t)}`))
    expect(bad, 'loyalty 只能用 orders 的公開事件（src/orders/events/），需要的 customerId、total 都在 OrderPaidEvent 裡，不必回頭查 OrdersService；src/orders/events/ 裡的檔案也不能轉 export orders 的其他檔案（barrel）').toEqual([])
  })

  it('只有 src/loyalty 碰 stampCard、pointTransaction（資料歸屬）', () => {
    const bad = files.filter(f => !under('loyalty')(f) && LOYALTY_TABLES.test(code.get(f)!)).map(rel)
    expect(bad, '這些檔案直接寫 loyalty 的資料表：加點的程式要留在 src/loyalty，不是搬進 orders').toEqual([])
  })
})

describe('練習 1：行為', () => {
  let app: INestApplication
  beforeAll(async () => { app = await createTestApp(AppModule) })
  afterAll(() => app?.close())

  it('付款之後顧客拿到點數（每滿 100 元 1 點），重複付款不會多加', async () => {
    const http = request(app.getHttpServer())
    const created = await http.post('/orders').send({ customerId: 7, items: [{ productId: 2, quantity: 2 }] })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect(created.body.total).toBe(220)
    expect((await http.post(`/orders/${created.body.id}/pay`)).status).toBe(200)
    await vi.waitFor(async () => expect(await points(7), '付款 220 元要加 2 點').toBe(2), { timeout: 3000, interval: 50 })
    expect((await http.post(`/orders/${created.body.id}/pay`)).status).toBe(409)
    await new Promise(r => setTimeout(r, 200))
    expect(await points(7), '第二次付款回 409，不能再加點').toBe(2)
    const res = await http.get('/loyalty/7')
    expect(res.body, 'GET /loyalty/:customerId 照樣能查餘額').toEqual({ customerId: 7, points: 2 })
  })

  it('LoyaltyModule 單獨就能運作：收到 OrderPaidEvent 就加點，不需要 OrdersModule', async () => {
    let ref
    try {
      ref = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true }), EventEmitterModule.forRoot(), PrismaModule, LoyaltyModule],
      }).compile()
    } catch (e) {
      throw new Error(`只有 LoyaltyModule（加上設定、事件、Prisma）時建立失敗：loyalty 還依賴 orders 的內部。${(e as Error).message}`)
    }
    const loyaltyApp = ref.createNestApplication({ logger: false })
    await loyaltyApp.init()
    try {
      loyaltyApp.get(EventEmitter2).emit('order.paid', new OrderPaidEvent(41, 9, 350, new Date()))
      await vi.waitFor(async () => expect(await points(9), "LoyaltyService 的方法要加上 @OnEvent('order.paid', { async: true })，點數用事件裡的 total 算：350 元 → 3 點").toBe(3), { timeout: 3000, interval: 50 })
      const tx = await db.pointTransaction.findMany({ select: { orderId: true, points: true } })
      expect(tx, '加點紀錄的 orderId 是事件裡的 orderId').toEqual([{ orderId: 41, points: 3 }])
    } finally {
      await loyaltyApp.close()
    }
  })
})

describe('練習 1：正式啟動', () => {
  it('nest build 之後 node dist/main.js 能啟動並回應', async () => {
    build(import.meta.dirname)
    const server = await start(import.meta.dirname)
    try {
      const res = await fetch(`${server.url}/loyalty/1`)
      expect(res.status, server.output()).toBe(200)
    } finally {
      await server.stop()
    }
  }, 90_000)
})
