// 練習 1：createOrder 包成一個互動式交易，逐項原子扣庫存；任何一項不足就整筆回滾、回 409 OUT_OF_STOCK
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './src/generated/prisma/client.js'
import { AppModule } from './src/app.module.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

// 連線池開到 25（預設 10）：比同時送出的 20 個請求多，量到的才是鎖的行為，不是排隊等連線
// 互動式交易的時限放寬到 30 秒（預設 maxWait 2 秒、timeout 5 秒）：判分的電腦可能很忙，量到的要是鎖與死結，不是機器慢
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 25 }),
  transactionOptions: { maxWait: 30_000, timeout: 30_000 },
})
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
// 每一句查詢之後停 20 毫秒：同時進來的請求一定會交錯，先讀再寫的 bug 每次都會出現
const slow = db.$extends({ query: { $allModels: { async $allOperations({ args, query }) { const r = await query(args); await sleep(20); return r } } } })

let app: INestApplication
beforeAll(async () => { app = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(slow) }) })
afterAll(async () => { await app?.close(); await db.$disconnect() })
beforeEach(() => resetDb(db))

// id 1 美式咖啡、2 拿鐵、3 可頌
async function seed(stock: { americano: number; latte: number; croissant: number }) {
  await db.product.createMany({ data: [
    { name: '美式咖啡', price: 80, stock: stock.americano },
    { name: '拿鐵', price: 110, stock: stock.latte },
    { name: '可頌', price: 70, stock: stock.croissant },
  ] })
}
const stockOf = async (id: number) => (await db.product.findUniqueOrThrow({ where: { id } })).stock
const order = (items: { productId: number; quantity: number }[]) => request(app.getHttpServer()).post('/orders').send({ items })

describe('練習 1：交易裡原子扣庫存', () => {
  it('成功的訂單：回 201、明細存下單價、total 正確', async () => {
    await seed({ americano: 10, latte: 10, croissant: 10 })
    const res = await order([{ productId: 2, quantity: 2 }, { productId: 3, quantity: 1 }])
    expect(res.status, `POST /orders 要回 201：${JSON.stringify(res.body)}`).toBe(201)
    expect(res.body.total, 'total ＝ 110 × 2 ＋ 70 × 1').toBe(290)
    expect(res.body.items?.map((i: { productId: number; unitPrice: number }) => [i.productId, i.unitPrice]).sort(), '明細的 unitPrice 是商品目前的價格').toEqual([[2, 110], [3, 70]])
    expect([await stockOf(2), await stockOf(3)], '拿鐵扣 2、可頌扣 1').toEqual([8, 9])
  })

  it('拿鐵剩 5 杯，20 個人同時各買 1 杯：剛好 5 筆成功，庫存 0', async () => {
    await seed({ americano: 10, latte: 5, croissant: 10 })
    const res = await Promise.all(Array.from({ length: 20 }, () => order([{ productId: 2, quantity: 1 }])))
    const statuses = res.map(r => r.status)
    expect(statuses.filter(s => s >= 500), `不能有 5xx：${JSON.stringify(res.find(r => r.status >= 500)?.body)}`).toEqual([])
    expect(statuses.filter(s => s === 201).length, '只有 5 筆能成功。超過 5 筆就是賣超：先讀庫存再寫回，兩個請求會讀到同一個數字。改用 updateMany({ where: { id, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } })，看 count').toBe(5)
    expect(statuses.filter(s => s === 409).length, '其他 15 筆回 409').toBe(15)
    expect(res.filter(r => r.status === 409).every(r => r.body.errorCode === 'OUT_OF_STOCK'), '庫存不足丟 OutOfStockError（errorCode OUT_OF_STOCK）').toBe(true)
    expect(await stockOf(2), '拿鐵的庫存最後是 0').toBe(0)
    expect(await db.order.count(), 'orders 只能有 5 筆').toBe(5)
    expect(await db.orderItem.count(), 'order_items 只能有 5 筆').toBe(5)
  })

  it('第二項庫存不足：整筆回滾，第一項的庫存不能少，也不能留下訂單', async () => {
    await seed({ americano: 10, latte: 5, croissant: 1 })
    const res = await order([{ productId: 2, quantity: 1 }, { productId: 3, quantity: 2 }])
    expect(res.status, `可頌只剩 1 個卻要買 2 個，要回 409：${JSON.stringify(res.body)}`).toBe(409)
    expect(res.body.errorCode, 'errorCode 是 OUT_OF_STOCK').toBe('OUT_OF_STOCK')
    expect(res.body.details?.productId, 'details.productId 是缺貨的那一項（可頌，id 3）').toBe(3)
    expect(res.body.details?.available, 'details.available 是目前的庫存（1）：count 是 0 時，在同一個 tx 裡再查一次商品，把它的 stock 傳給 OutOfStockError').toBe(1)
    expect(await stockOf(3), '可頌的庫存不能被改').toBe(1)
    expect(await stockOf(2), '拿鐵的庫存要還是 5：扣庫存、建立訂單都要用同一個 this.prisma.$transaction(async tx => …) 的 tx，丟出例外才會整筆回滾').toBe(5)
    expect(await db.order.count(), '不能留下訂單').toBe(0)
  })

  it('商品不存在：回 404 PRODUCT_NOT_FOUND（不是 409），前面扣掉的庫存也要還原', async () => {
    await seed({ americano: 10, latte: 5, croissant: 10 })
    const res = await order([{ productId: 2, quantity: 1 }, { productId: 999, quantity: 1 }])
    expect(res.status, `count 是 0 時再查一次商品：查不到就丟 ProductNotFoundError（404）。收到：${res.status} ${JSON.stringify(res.body)}`).toBe(404)
    expect(res.body.errorCode, 'errorCode 是 PRODUCT_NOT_FOUND').toBe('PRODUCT_NOT_FOUND')
    expect(await stockOf(2), '拿鐵的庫存要還是 5：整筆回滾').toBe(5)
    expect(await db.order.count(), '不能留下訂單').toBe(0)
  })
})
