// 練習 3：樂觀鎖。PATCH /products/:id/price { price, version }
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
// 每一句查詢之後先等另一個請求也跑完它的那一句（最多 500 毫秒）：兩個請求一定會交錯，每次結果都一樣
let waiting: (() => void)[] = []
const meet = () => new Promise<void>(resolve => {
  waiting.push(resolve)
  if (waiting.length >= 2) { waiting.forEach(f => f()); waiting = [] }
  else setTimeout(() => { waiting = waiting.filter(f => f !== resolve); resolve() }, 500)
})
const slow = db.$extends({ query: { $allModels: { async $allOperations({ args, query }) { const r = await query(args); await meet(); return r } } } })

let app: INestApplication
beforeAll(async () => { app = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(slow) }) })
afterAll(async () => { await app?.close(); await db.$disconnect() })
beforeEach(async () => {
  await resetDb(db)
  await db.product.create({ data: { name: '拿鐵', price: 110, stock: 10 } })   // id 1，version 1
})

const patch = (id: number, body: { price: number; version: number }) => request(app.getHttpServer()).patch(`/products/${id}/price`).send(body)

describe('練習 3：樂觀鎖（version 欄位）', () => {
  it('兩個店員拿著同一個 version 同時改價：一個 200、一個 409 STALE_VERSION', async () => {
    const [a, b] = await Promise.all([patch(1, { price: 120, version: 1 }), patch(1, { price: 115, version: 1 })])
    const statuses = [a.status, b.status].sort()
    expect(statuses, '只能有一個成功。兩個都 200 代表後送出的蓋掉了前一個：比對 version 和更新要在同一句 updateMany({ where: { id, version } … }) 裡，不能先讀出來在程式裡比').toEqual([200, 409])
    const ok = a.status === 200 ? a : b, stale = a.status === 200 ? b : a
    expect(ok.body, '成功時回 { id, price, version }，version 變成 2').toEqual({ id: 1, price: ok === a ? 120 : 115, version: 2 })
    expect(stale.body.errorCode, '失敗的那個丟 StaleVersionError（errorCode STALE_VERSION）').toBe('STALE_VERSION')
    const row = await db.product.findUniqueOrThrow({ where: { id: 1 } })
    expect([row.price, row.version], '資料庫裡是成功那一個的價格，version 2').toEqual([ok.body.price, 2])
  })

  it('拿舊的 version 再送一次 → 409；拿新的 version → 200、version 再加 1', async () => {
    expect((await patch(1, { price: 120, version: 1 })).status, 'version 1 第一次送出要成功').toBe(200)
    const old = await patch(1, { price: 100, version: 1 })
    expect(old.status, '用已經過期的 version 1 再改一次要 409').toBe(409)
    expect((await db.product.findUniqueOrThrow({ where: { id: 1 } })).price, '409 時價格不能被改').toBe(120)
    const next = await patch(1, { price: 125, version: 2 })
    expect(next.status, '用最新的 version 2 要成功').toBe(200)
    expect(next.body.version, '成功後 version 是 3').toBe(3)
  })

  it('商品不存在 → 404 PRODUCT_NOT_FOUND（不是 409，也不是 500）', async () => {
    const res = await patch(999, { price: 100, version: 1 })
    expect(res.status, 'count 是 0 時，再查一次商品存不存在：不存在丟 ProductNotFoundError').toBe(404)
    expect(res.body.errorCode).toBe('PRODUCT_NOT_FOUND')
  })
})
