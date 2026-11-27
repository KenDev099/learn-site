// 練習 1：shared/contract.ts 的三個 schema；API 用它驗證請求、錯誤回 { code, message }；前台用它解析回應
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import pg from 'pg'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './api/src/app.module.js'

const dir = import.meta.dirname
const read = (file: string) => readFileSync(join(dir, file), 'utf8')
const contract: Record<string, any> = await import('./shared/contract.ts')
const schema = (name: string) => {
  const s = contract[name]
  expect(typeof s?.safeParse, `shared/contract.ts 要 export 一個叫 ${name} 的 zod schema（export const ${name} = z.object(…)）`).toBe('function')
  return s
}

const ITEMS = [{ productId: 1, quantity: 2 }]
// 一筆合法的回應：note 與 customerNote 都放，練習 2 前後的契約都能用
const GOOD = {
  id: 7, status: 'pending', total: 160, note: null, customerNote: null,
  orderedAt: '2026-11-03T00:10:00.000Z', pickupAt: null,
  items: [{ productId: 1, quantity: 2, unitPrice: 80 }],
}

let app: INestApplication
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
const orderCount = async () => Number((await db.query('SELECT count(*) FROM orders')).rows[0].count)
const post = (body: object) => request(app.getHttpServer()).post('/orders').send(body)

beforeAll(async () => {
  await db.connect()
  app = await createTestApp(AppModule)
})
afterAll(async () => {
  await db.end()
  await app?.close()
})
afterEach(() => vi.unstubAllGlobals())

describe('練習 1：契約本身', () => {
  it('OrderRequest：數量 0、-1、1.5、空的 items、沒有位移的 pickupAt 都不合法', () => {
    const OrderRequest = schema('OrderRequest')
    expect(OrderRequest.safeParse({ customerId: 1, items: ITEMS }).success, '{ customerId: 1, items: [{ productId: 1, quantity: 2 }] } 是合法的請求').toBe(true)
    expect(OrderRequest.safeParse({ customerId: 1, items: ITEMS, pickupAt: '2026-11-03T08:30:00+08:00' }).success, 'pickupAt 帶 +08:00 要合法：z.iso.datetime({ offset: true })').toBe(true)
    for (const quantity of [0, -1, 1.5]) {
      expect(OrderRequest.safeParse({ customerId: 1, items: [{ productId: 1, quantity }] }).success, `quantity ${quantity} 要不合法：用 z.int().min(1)，只寫 z.number() 擋不住`).toBe(false)
    }
    expect(OrderRequest.safeParse({ customerId: 1, items: [] }).success, 'items 是空陣列要不合法：.min(1)').toBe(false)
    expect(OrderRequest.safeParse({ customerId: 1, items: ITEMS, pickupAt: '2026-11-03T08:30:00' }).success, '沒有時區位移的 pickupAt 要不合法（跟第 3 課的 @IsRFC3339 一樣）').toBe(false)
  })

  it('OrderResponse：欄位型別不對就不合法', () => {
    const OrderResponse = schema('OrderResponse')
    expect(OrderResponse.safeParse(GOOD).success, `這筆回應要合法：${JSON.stringify(GOOD)}`).toBe(true)
    expect(OrderResponse.safeParse({ ...GOOD, total: '160' }).success, 'total 是字串 "160" 要不合法').toBe(false)
    expect(OrderResponse.safeParse({ ...GOOD, items: undefined }).success, '少了 items 要不合法').toBe(false)
    expect(OrderResponse.safeParse({ ...GOOD, orderedAt: '昨天' }).success, 'orderedAt 不是 ISO 時間要不合法：z.iso.datetime()').toBe(false)
  })

  it('ApiErrorBody：code 與 message 都是必填字串', () => {
    const ApiErrorBody = schema('ApiErrorBody')
    expect(ApiErrorBody.safeParse({ code: 'SLOT_FULL', message: '已額滿' }).success, '{ code, message } 要合法').toBe(true)
    expect(ApiErrorBody.safeParse({ message: '已額滿' }).success, '沒有 code 要不合法').toBe(false)
    expect(ApiErrorBody.safeParse({ code: 'SLOT_FULL' }).success, '沒有 message 要不合法').toBe(false)
  })
})

describe('練習 1：API 用契約', () => {
  it('OrdersController 用 @Body({ schema }) 驗證、import shared/contract，不再用 CreateOrderDto', () => {
    const code = read('api/src/orders/orders.controller.ts')
    expect(code, "orders.controller.ts 要 import '../../../shared/contract.js'").toMatch(/from\s+['"](\.\.\/)+shared\/contract\.js['"]/)
    expect(code, '下單的 @Body 要寫成 @Body({ schema: … })，交給 StandardSchemaValidationPipe 驗證').toMatch(/@Body\(\s*\{\s*schema\s*:/)
    expect(code, 'controller 不要再用 class-validator 的 CreateOrderDto').not.toMatch(/CreateOrderDto/)
  })

  it('下單成功的回應通過 OrderResponse，GET /orders/:id 也是', async () => {
    const OrderResponse = schema('OrderResponse')
    const res = await post({ customerId: 1, items: ITEMS })
    expect(res.status, `合法的訂單要 201，得到 ${res.status}：${JSON.stringify(res.body)}`).toBe(201)
    const parsed = OrderResponse.safeParse(res.body)
    expect(parsed.success, `POST /orders 的回應要通過 OrderResponse：${JSON.stringify(res.body)}\n${parsed.error?.message ?? ''}`).toBe(true)
    expect(res.body.total, '2 杯美式咖啡，total 是 160').toBe(160)
    expect(typeof res.body.orderedAt, 'orderedAt 在 JSON 裡是 ISO 字串').toBe('string')
    const got = await request(app.getHttpServer()).get(`/orders/${res.body.id}`)
    expect(got.status).toBe(200)
    expect(OrderResponse.safeParse(got.body).success, `GET /orders/:id 的回應也要通過 OrderResponse：${JSON.stringify(got.body)}`).toBe(true)
  })

  for (const quantity of [0, -1, 1.5]) {
    it(`quantity ${quantity}：422，body 是 { code, message }，不建立訂單`, async () => {
      const ApiErrorBody = schema('ApiErrorBody')
      const before = await orderCount()
      const res = await post({ customerId: 1, items: [{ productId: 1, quantity }] })
      expect(res.status, `quantity ${quantity} 要 422，得到 ${res.status}：${JSON.stringify(res.body)}`).toBe(422)
      expect(typeof res.body.code === 'string' && typeof res.body.message === 'string', `錯誤的 body 要是 { code: 字串, message: 字串 }，得到 ${JSON.stringify(res.body)}`).toBe(true)
      expect(ApiErrorBody.safeParse(res.body).success, '錯誤的 body 要通過 ApiErrorBody').toBe(true)
      expect(await orderCount(), '驗證失敗不能建立訂單').toBe(before)
    })
  }

  const NOT_FOUND: [string, () => request.Test][] = [
    ['不存在的顧客', () => post({ customerId: 999, items: ITEMS })],
    ['不存在的商品', () => post({ customerId: 1, items: [{ productId: 999, quantity: 1 }] })],
    ['不存在的訂單 GET /orders/999999', () => request(app.getHttpServer()).get('/orders/999999')],
  ]
  for (const [why, send] of NOT_FOUND) {
    it(`${why}：404，body 也是 { code, message }`, async () => {
      const res = await send()
      expect(res.status, `${why}要 404，得到 ${res.status}`).toBe(404)
      expect(typeof res.body.code === 'string' && typeof res.body.message === 'string', `404 的 body 也要符合契約 { code, message }：NotFoundException 傳物件，例如 { code: 'CUSTOMER_NOT_FOUND', message }。得到 ${JSON.stringify(res.body)}`).toBe(true)
    })
  }
})

describe('練習 1：前台用契約', () => {
  const files = (sub: string): string[] => readdirSync(join(dir, sub), { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? files(join(sub, e.name)) : /\.(ts|vue)$/.test(e.name) ? [join(sub, e.name)] : [])

  it('web/src 不再自己宣告 Order、OrderRequest、OrderResponse', () => {
    for (const file of files('web/src')) {
      const m = read(file).match(/^\s*(export\s+)?(interface|type)\s+(Order|OrderRequest|OrderResponse)\b/m)
      expect(m?.[0].trim(), `${file} 還有手寫的「${m?.[0].trim()}」：刪掉，改用 shared/contract.ts 的型別`).toBeUndefined()
    }
  })

  it("web/src/api/orders.ts import '../../../shared/contract.ts'", () => {
    expect(read('web/src/api/orders.ts')).toMatch(/from\s+['"](\.\.\/)+shared\/contract\.ts['"]/)
  })

  const fakeFetch = (body: unknown, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })))

  it('createOrder／getOrder：合法的回應照常回傳', async () => {
    const { createOrder, getOrder } = await import('./web/src/api/orders.ts')
    fakeFetch(GOOD)
    const created: any = await createOrder({ customerId: 1, items: ITEMS } as any)
    expect(created.id, 'createOrder 要回傳解析後的訂單').toBe(7)
    expect(created.total).toBe(160)
    fakeFetch(GOOD)
    expect(((await getOrder(7)) as any).id, 'getOrder 要回傳解析後的訂單').toBe(7)
  })

  it('createOrder／getOrder：回應不符合契約時要丟錯（用 safeParse 檢查，不能只寫 as）', async () => {
    const { createOrder, getOrder } = await import('./web/src/api/orders.ts')
    fakeFetch({ ...GOOD, total: '160' })
    await expect(createOrder({ customerId: 1, items: ITEMS } as any), 'total 是字串的回應，createOrder 要丟錯，不能把錯的資料交給畫面').rejects.toThrow()
    fakeFetch({ id: 7 })
    await expect(getOrder(7), '只有 id 的回應，getOrder 要丟錯').rejects.toThrow()
  })
})
