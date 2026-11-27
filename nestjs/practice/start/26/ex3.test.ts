// 練習 3：拆掉什麼都放的 @Global SharedModule，每個 provider 回到擁有它的模組
import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { INestApplication, Type } from '@nestjs/common'
import request from 'supertest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './src/generated/prisma/client.js'
import { AppModule } from './src/app.module.js'
import { CatalogModule } from './src/catalog/catalog.module.js'
import { PricingService } from './src/catalog/pricing.service.js'
import { Mailer } from './src/notifications/mailer.js'
import { NotificationsModule } from './src/notifications/notifications.module.js'
import { OrdersModule } from './src/orders/orders.module.js'
import { OrdersRepository } from './src/orders/orders.repository.js'
import { PrismaModule } from './src/prisma/prisma.module.js'
import { ReceiptsListener } from './src/notifications/receipts.listener.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

// 從 AppModule 沿著 imports 走過所有「我們自己寫的」模組（動態模組如 ConfigModule.forRoot() 略過）
type Mod = Type & { name: string }
const resolveRef = (x: any) => (x && typeof x === 'object' && typeof x.forwardRef === 'function' ? x.forwardRef() : x)
const meta = (key: string, m: Mod): any[] => (Reflect.getMetadata(key, m) ?? []).map(resolveRef)
const asClass = (p: any) => (typeof p === 'function' ? p : typeof p?.provide === 'function' ? p.provide : undefined)
function modules() {
  const seen = new Set<Mod>()
  const walk = (m: Mod) => {
    if (seen.has(m)) return
    seen.add(m)
    for (const i of meta('imports', m)) if (typeof i === 'function') walk(i)
  }
  walk(AppModule as Mod)
  return [...seen]
}
const ownersOf = (cls: unknown) => modules().filter(m => meta('providers', m).map(asClass).includes(cls))
const names = (ms: Mod[]) => ms.map(m => m.name).join('、') || '沒有'

describe('練習 3：模組邊界', () => {
  it('@Global() 只留給 PrismaModule', () => {
    const SRC = join(import.meta.dirname, 'src')
    const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter(f => f.endsWith('.ts') && !f.startsWith('generated/'))
    const bad = files.filter(f => /@Global\s*\(/.test(readFileSync(join(SRC, f), 'utf8').replace(/^\s*\/\/.*$/gm, '')) && relative('prisma', f) !== 'prisma.module.ts')
    expect(bad, '這些檔案還有 @Global()：全域只留給基礎設施（Prisma；設定用 ConfigModule 的 isGlobal）。業務模組用 imports／exports 寫出依賴').toEqual([])
    const globals = modules().filter(m => Reflect.getMetadata('__module:global__', m)).map(m => m.name)
    expect(globals, '全域模組只能有 PrismaModule').toEqual(['PrismaModule'])
  })

  it('每個 provider 只由擁有它的模組提供', () => {
    for (const [cls, owner, why] of [
      [Mailer, NotificationsModule, '寄信屬於 notifications'],
      [PricingService, CatalogModule, '報價要查商品，屬於 catalog'],
      [OrdersRepository, OrdersModule, '訂單資料存取屬於 orders'],
    ] as const) {
      const owners = ownersOf(cls)
      expect(owners, `${cls.name} 現在由「${names(owners)}」提供；要只放在 ${owner.name} 的 providers（${why}）。不要換個名字再做一個什麼都放的模組`).toEqual([owner])
    }
  })

  it('OrdersRepository 不 export：別的模組透過 OrdersService 讀訂單', () => {
    const leaking = modules().filter(m => meta('exports', m).map(asClass).includes(OrdersRepository))
    expect(names(leaking), 'OrdersRepository 是 orders 的內部。收據要訂單內容，就注入 orders 公開的 OrdersService（findOne）').toBe('沒有')
    const exported = meta('exports', OrdersModule as Mod).map(e => (typeof e === 'function' ? e.name : typeof e?.provide === 'function' ? e.provide.name : String(e?.provide ?? e)))
    expect(exported, 'OrdersModule 的公開介面只有 OrdersService：不要用別的 token（例如字串）把 repository 換個名字送出去').toEqual(['OrdersService'])
    const deps = (Reflect.getMetadata('design:paramtypes', ReceiptsListener) ?? []).map((d: Type) => d?.name)
    expect(deps, 'ReceiptsListener 要注入 orders 公開的 OrdersService，用 findOne 讀訂單').toContain('OrdersService')
  })

  it('只有 src/orders 碰訂單的資料表與 OrdersRepository（資料歸屬）', () => {
    const SRC = join(import.meta.dirname, 'src')
    const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.startsWith('generated/') && !f.startsWith('orders/'))
    const touches = /\.\s*(order|orderItem)\s*\.\s*(find|create|update|upsert|delete|count|aggregate|groupBy)\w*\s*\(|\[\s*['"`](order|orderItem)['"`]\s*\]|orders\.repository\.js/
    const bad = files.filter(f => touches.test(readFileSync(join(SRC, f), 'utf8').replace(/^\s*\/\/.*$/gm, '')))
    expect(bad, 'orders、order_items 屬於 orders：別的模組不要直接查（this.prisma.order…）或 import orders.repository.js，改成注入 OrdersService').toEqual([])
  })

  it('每個注入的依賴都寫在 imports 裡，而且對方有 export', () => {
    const all = modules()
    const problems: string[] = []
    for (const m of all) {
      for (const cls of [...meta('providers', m), ...meta('controllers', m)].map(asClass).filter(Boolean)) {
        const self: { index: number; param: unknown }[] = Reflect.getMetadata('self:paramtypes', cls) ?? []
        const deps = [...(Reflect.getMetadata('design:paramtypes', cls) ?? [])]
        for (const s of self) deps[s.index] = resolveRef(s.param)
        for (const dep of deps) {
          const owner = all.find(o => meta('providers', o).map(asClass).includes(dep))
          if (!owner || owner === m || owner === PrismaModule) continue
          if (!meta('imports', m).includes(owner)) problems.push(`${m.name} 的 ${cls.name} 注入 ${dep.name}，但 ${m.name} 沒有 import ${owner.name}`)
          else if (!meta('exports', owner).map(asClass).includes(dep)) problems.push(`${owner.name} 沒有 export ${dep.name}`)
        }
      }
    }
    expect(problems, '依賴要寫在 @Module 的 imports：打開模組檔就看得出它依賴誰（例如 OrdersModule imports CatalogModule）').toEqual([])
  })
})

describe('練習 3：下單、付款、寄收據照樣運作', () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
  let app: INestApplication
  beforeAll(async () => { app = await createTestApp(AppModule) })
  afterAll(async () => { await app?.close(); await db.$disconnect() })
  beforeEach(async () => {
    await resetDb(db)
    await db.product.createMany({ data: [{ name: '美式咖啡', price: 80 }, { name: '拿鐵', price: 110 }, { name: '起司蛋糕', price: 120 }] })
  })

  it('付款後寄出一封收據，內容是每一項與合計', async () => {
    const mailer = app.get(Mailer, { strict: false })
    mailer.sent.length = 0
    const http = request(app.getHttpServer())
    const created = await http.post('/orders').send({ customerId: 3, items: [{ productId: 2, quantity: 2 }, { productId: 3, quantity: 1 }] })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect((await http.post(`/orders/${created.body.id}/pay`)).status).toBe(200)
    await vi.waitFor(() => expect(mailer.sent.length, '付款後要寄一封收據').toBe(1), { timeout: 3000, interval: 50 })
    expect(mailer.sent[0]).toEqual({
      customerId: 3,
      subject: `收據：訂單 ${created.body.id}`,
      text: '拿鐵 x2 220 元\n起司蛋糕 x1 120 元\n合計 340 元',
    })
    expect((await http.get(`/orders/${created.body.id}`)).body.status).toBe('paid')
  })

  it('不存在的商品回 404', async () => {
    const res = await request(app.getHttpServer()).post('/orders').send({ customerId: 3, items: [{ productId: 99, quantity: 1 }] })
    expect(res.status).toBe(404)
  })
})
