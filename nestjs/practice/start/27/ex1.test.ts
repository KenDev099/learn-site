// 練習 1：POST /api/v1/orders 的 Idempotency-Key
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { AppModule } from './src/app.module.js'
import { configureApp } from './src/app.setup.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

// 判分時不讀 .env：測試要的設定在這裡給（vi.hoisted 在所有 import 之前執行）
vi.hoisted(() => {
  process.env.PAYMENT_WEBHOOK_SECRET = 'test-only-webhook-secret-0123456789'
  process.env.ADMIN_KEY = 'test-only-admin-key-0123456789'
})

let app: INestApplication
let prisma: PrismaService
beforeAll(async () => {
  app = await createTestApp(AppModule, { configure: configureApp, options: { logger: false, rawBody: true } })
  prisma = app.get(PrismaService)
})
afterAll(() => app?.close())
beforeEach(async () => {
  await resetDb(prisma)
  await prisma.customer.createMany({ data: [{ name: '王小明', email: 'ming@example.com' }, { name: '陳美華', email: 'meihua@example.com' }] })
  await prisma.category.create({ data: { name: '咖啡' } })
  await prisma.product.createMany({ data: [
    { categoryId: 1, name: '美式咖啡', price: 80, stock: 20 },
    { categoryId: 1, name: '拿鐵', price: 110, stock: 20 },
  ] })
})

const post = (key: string | undefined, body: object) => {
  const req = request(app.getHttpServer()).post('/api/v1/orders')
  return key === undefined ? req.send(body) : req.set('Idempotency-Key', key).send(body)
}
const latte = (quantity: number, customerId = 1) => ({ customerId, items: [{ productId: 2, quantity }] })
const orderCount = () => prisma.order.count()
const stock = async (id: number) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stock

describe('練習 1：Idempotency-Key', () => {
  it('沒帶或格式不對的 Idempotency-Key：400 IDEMPOTENCY_KEY_REQUIRED，不建立訂單', async () => {
    for (const key of [undefined, '', 'has space', 'x'.repeat(65)]) {
      const res = await post(key, latte(1))
      expect(res.status, `Idempotency-Key 是 ${JSON.stringify(key)} 時要 400：沒有 key 就沒辦法保證重送安全，下單一定要帶（1–64 個英數、-、_）`).toBe(400)
      expect(res.body.errorCode, '用 IdempotencyKeyRequiredError，回應的 errorCode 是 IDEMPOTENCY_KEY_REQUIRED').toBe('IDEMPOTENCY_KEY_REQUIRED')
    }
    expect(await orderCount(), '被擋下的請求不能建立訂單').toBe(0)
    expect(await stock(2), '被擋下的請求不能扣庫存').toBe(20)
  })

  it('同一個 key、同樣的內容重送：回傳第一次的狀態碼與一字不差的內容，只有一張訂單、只扣一次庫存', async () => {
    const first = await post('checkout-a1', latte(2))
    expect(first.status, `第一次下單要 201，收到 ${first.status}：${first.text}`).toBe(201)
    expect(first.body.total, '2 杯拿鐵 220 元').toBe(220)
    expect(first.headers['content-type'], '回應要是 JSON').toMatch(/application\/json/)
    const again = await post('checkout-a1', latte(2))
    expect(again.status, '重送要回第一次的狀態碼 201，不是 200').toBe(201)
    expect(again.text, '重送要回傳第一次的回應內容，一字不差').toBe(first.text)
    expect(await orderCount(), '同一個 key 重送不能建立第二張訂單').toBe(1)
    expect(await stock(2), '庫存只能扣一次：20 - 2 = 18').toBe(18)
  })

  it('訂單狀態改變之後重送：回傳的是存下來的第一次回應，不是重新查的現在狀態', async () => {
    const first = await post('checkout-b1', latte(1))
    expect(first.status, first.text).toBe(201)
    await prisma.order.update({ where: { id: first.body.id }, data: { status: 'paid' } })
    const again = await post('checkout-b1', latte(1))
    expect(again.status).toBe(201)
    expect(again.text, '重送要回傳存下來的第一次回應（status 還是 pending）：把第一次的回應字串存進 idempotency_keys.response_body，重送時原封不動送出，不要重新查訂單').toBe(first.text)
  })

  it('同一個 key、不同的內容：422 IDEMPOTENCY_KEY_REUSED，不建立新訂單', async () => {
    expect((await post('checkout-c1', latte(1))).status).toBe(201)
    for (const body of [latte(3), latte(1, 2), { customerId: 1, items: [{ productId: 1, quantity: 1 }] }]) {
      const res = await post('checkout-c1', body)
      expect(res.status, `同一個 key 配上不同的內容 ${JSON.stringify(body)} 要 422：key 要綁定請求內容（存 request_hash，重送時比對），不能默默回傳舊訂單`).toBe(422)
      expect(res.body.errorCode).toBe('IDEMPOTENCY_KEY_REUSED')
    }
    expect(await orderCount()).toBe(1)
    expect(await stock(2)).toBe(19)
  })

  it('不同的 key、同樣的內容：是兩次不同的購買，建立兩張訂單', async () => {
    expect((await post('checkout-d1', latte(1))).status).toBe(201)
    expect((await post('checkout-d2', latte(1))).status, '不同的 key 代表不同的操作（客人真的想再買一杯）').toBe(201)
    expect(await orderCount(), '去重要看 key，不是看內容').toBe(2)
  })

  it('同一個 key 同時送 5 次（重複 3 輪）：每輪只建立一張訂單，其他回傳第一次的結果或 409 IDEMPOTENCY_KEY_IN_PROGRESS', async () => {
    for (const round of [1, 2, 3]) {
      const key = `burst-${round}`
      const results = await Promise.all(Array.from({ length: 5 }, () => post(key, latte(1))))
      const created = results.filter(r => r.status === 201)
      const statuses = results.map(r => r.status).join(', ')
      expect(created.length, `第 ${round} 輪的狀態碼：${statuses}。至少要有一個 201`).toBeGreaterThan(0)
      for (const r of results) {
        if (r.status === 409) {
          expect(r.body.errorCode, '409 只能是 IDEMPOTENCY_KEY_IN_PROGRESS').toBe('IDEMPOTENCY_KEY_IN_PROGRESS')
          continue
        }
        expect(r.status, `第 ${round} 輪的狀態碼：${statuses}。同時進來的重複請求要嘛回傳第一次的結果，要嘛 409：key 要在建立訂單的同一個交易裡、在建立訂單之前寫入，靠主鍵擋下同時進來的第二個，撞到之後（P2002）改讀存下來的回應`).toBe(201)
        expect(r.text, '每個 201 的內容都要是同一張訂單').toBe(created[0].text)
      }
    }
    expect(await orderCount(), '3 輪只能有 3 張訂單：先查 key 再建立訂單、或建立訂單之後才存 key，同時送來的請求都會各建一張').toBe(3)
    expect(await stock(2), '庫存只能扣 3 次').toBe(17)
  })

  it('下單失敗（庫存不足）不會占住 key：補貨之後用同一個 key 重試會成功', async () => {
    await prisma.product.update({ where: { id: 2 }, data: { stock: 5 } })
    const fail = await post('checkout-e1', latte(8))
    expect(fail.status, '庫存只有 5，要 8 杯：409 OUT_OF_STOCK').toBe(409)
    await prisma.product.update({ where: { id: 2 }, data: { stock: 20 } })
    const retry = await post('checkout-e1', latte(8))
    expect(retry.status, `補貨後用同一個 key 重試要 201，收到 ${retry.status}（${retry.body.errorCode}）：下單失敗時 key 要跟著交易一起回滾，不能留下一筆「處理中」的 key`).toBe(201)
  })
})
