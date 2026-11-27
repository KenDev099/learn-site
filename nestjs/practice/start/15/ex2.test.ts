// 練習 2：方向相反的多商品訂單同時進來，不能死結
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './src/generated/prisma/client.js'
import { AppModule } from './src/app.module.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { OrdersService } from './src/orders/orders.service.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

// 連線池開到 25（預設 10）：比同時送出的 20 個請求多，量到的才是鎖的行為，不是排隊等連線
// 互動式交易的時限放寬到 30 秒（預設 maxWait 2 秒、timeout 5 秒）：判分的電腦可能很忙，量到的要是鎖與死結，不是機器慢
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 25 }),
  transactionOptions: { maxWait: 30_000, timeout: 30_000 },
})
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const slow = db.$extends({ query: { $allModels: { async $allOperations({ args, query }) { const r = await query(args); await sleep(5); return r } } } })

let app: INestApplication
beforeAll(async () => { app = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(slow) }) })
afterAll(async () => { await app?.close(); await db.$disconnect() })
beforeEach(() => resetDb(db))

describe('練習 2：依 productId 排序上鎖，避免死結', () => {
  it('10 筆 [拿鐵, 可頌] 和 10 筆 [可頌, 拿鐵] 同時送出：全部 201，庫存剛好各扣 20', async () => {
    await db.product.createMany({ data: [
      { name: '美式咖啡', price: 80, stock: 100 },
      { name: '拿鐵', price: 110, stock: 100 },
      { name: '可頌', price: 70, stock: 100 },
    ] })
    const latteFirst = [{ productId: 2, quantity: 1 }, { productId: 3, quantity: 1 }]
    const croissantFirst = [{ productId: 3, quantity: 1 }, { productId: 2, quantity: 1 }]
    const res = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      request(app.getHttpServer()).post('/orders').send({ items: i % 2 ? croissantFirst : latteFirst })))
    const failed = res.filter(r => r.status !== 201)
    expect(failed.map(r => r.status), `全部要成功。出現 500 通常是死結（SQLSTATE 40P01，Prisma 丟 P2034）：A 鎖住拿鐵等可頌、B 鎖住可頌等拿鐵。在交易裡依 productId 由小到大處理。第一個失敗的回應：${JSON.stringify(failed[0]?.body)}`).toEqual([])
    const stocks = await db.product.findMany({ where: { id: { in: [2, 3] } }, orderBy: { id: 'asc' }, select: { stock: true } })
    expect(stocks.map(s => s.stock), '拿鐵、可頌各賣 20，庫存都是 80：多了就是有扣庫存被覆蓋掉（先讀再寫）').toEqual([80, 80])
    expect(await db.orderItem.count(), 'order_items 要有 40 筆').toBe(40)
  })

  it('排序不能改到呼叫者傳進來的陣列', async () => {
    await db.product.createMany({ data: [
      { name: '美式咖啡', price: 80, stock: 10 },
      { name: '拿鐵', price: 110, stock: 10 },
      { name: '可頌', price: 70, stock: 10 },
    ] })
    const items = [{ productId: 3, quantity: 1 }, { productId: 2, quantity: 1 }]
    await app.get(OrdersService).createOrder(items)
    expect(items.map(i => i.productId), 'items.sort(…) 會直接改到原本的陣列（呼叫者手上的資料被你換了順序）。先複製一份：[...items].sort(…)').toEqual([3, 2])
  })
})
