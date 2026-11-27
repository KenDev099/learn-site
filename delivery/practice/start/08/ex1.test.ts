// 練習 1：建立付款時，逾時標 unknown（不是 failed），重試沿用同一把 Idempotency-Key
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import pg from 'pg'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { startCafePay } from './cafepay/server.mjs'
import { AppModule } from './api/src/app.module.js'

type Fake = Awaited<ReturnType<typeof startCafePay>>
let fake: Fake
let app: INestApplication
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
const paymentOf = async (orderId: number) => (await db.query('SELECT status FROM payments WHERE order_id = $1', [orderId])).rows[0]?.status
const orderStatus = async (orderId: number) => (await db.query('SELECT status FROM orders WHERE id = $1', [orderId])).rows[0]?.status
const chargesOf = (orderId: number) => fake.charges.filter(c => c.orderId === orderId)
const keysOf = (orderId: number) => [...new Set(fake.requests.filter(r => r.body.orderId === orderId).map(r => r.key))]
const pay = (orderId: number, cardToken = 'tok_visa') => request(app.getHttpServer()).post(`/orders/${orderId}/pay`).send({ cardToken })
async function newOrder(customerId: number) {
  const res = await request(app.getHttpServer()).post('/orders').send({ customerId, items: [{ productId: 2, quantity: 1 }] })
  expect(res.status, `建立測試用的訂單失敗：${res.status} ${JSON.stringify(res.body)}`).toBe(201)
  return res.body.id as number
}

beforeAll(async () => {
  await db.connect()
  fake = await startCafePay()
  process.env.CAFEPAY_URL = fake.url
  process.env.CAFEPAY_TIMEOUT_MS = '300'
  process.env.CAFEPAY_WEBHOOK_SECRET = 'whsec_test'
  app = await createTestApp(AppModule, { options: { logger: false, rawBody: true } })
})
afterAll(async () => {
  await app?.close()
  await fake?.close()
  await db.end()
})

describe('練習 1：結果不明與冪等鍵', () => {
  it('CafePay 扣款後沒有回應：API 回 202 { status: "unknown" }，付款標成 unknown（不是 failed）', async () => {
    const id = await newOrder(1)
    fake.faults.timeoutAfterCharge = 1
    const res = await pay(id)
    expect(chargesOf(id).length, 'CafePay 應該已經扣了一次款').toBe(1)
    expect(res.status, `逾時代表「不知道結果」，CafePay 其實已經扣款了。要回 202，得到 ${res.status}：${JSON.stringify(res.body)}`).toBe(202)
    expect(res.body.status, '回應的 status 要是 unknown，前台才會顯示「付款確認中」').toBe('unknown')
    expect(await paymentOf(id), '逾時不能標成 failed：客人看到「付款失敗」會再付一次。要標 unknown').toBe('unknown')
    expect(await orderStatus(id), '還不知道結果，訂單不能先改成 paid').not.toBe('paid')
  })

  it('同一張訂單再呼叫一次付款：CafePay 只扣一次款（每次的 key 都相同），訂單變成 paid', async () => {
    const id = await newOrder(2)
    fake.faults.timeoutAfterCharge = 1
    await pay(id)
    const retry = await pay(id)
    const keys = keysOf(id)
    expect(fake.requests.filter(r => r.body.orderId === id).length, '重試時要真的再呼叫 CafePay（用同一把 key 問結果）').toBeGreaterThanOrEqual(2)
    expect(keys.length, `同一張訂單的每次扣款請求要用同一把 Idempotency-Key，收到的 key：${keys.join('、')}。key 要從訂單推出來（例如 payment:<訂單 id>），不能每次用 randomUUID() 或時間`).toBe(1)
    expect(chargesOf(id).length, `CafePay 扣了 ${chargesOf(id).length} 次款：重試扣了第二次`).toBe(1)
    expect(retry.status, `重試要拿到第一次的結果（成功），回 200，得到 ${retry.status}：${JSON.stringify(retry.body)}`).toBe(200)
    expect(retry.body.status).toBe('paid')
    expect(await paymentOf(id), '付款要變成 paid').toBe('paid')
    expect(await orderStatus(id), '訂單要變成 paid').toBe('paid')
  })

  it('同一位客人的兩張訂單用不同的 key，各扣各的', async () => {
    const a = await newOrder(3)
    const b = await newOrder(3)
    const ra = await pay(a)
    const rb = await pay(b)
    expect([ra.status, rb.status], `兩張訂單都要付款成功，得到 ${ra.status} ${JSON.stringify(ra.body)}、${rb.status} ${JSON.stringify(rb.body)}。兩張訂單共用同一把 key 時（固定字串、用客人 id 推出來），CafePay 會拒絕第二張（idempotency_key_reused）。key 要從訂單 id 推出來`).toEqual([200, 200])
    expect(keysOf(a)[0], '不同訂單的 key 要不同').not.toBe(keysOf(b)[0])
    expect(chargesOf(a).length + chargesOf(b).length).toBe(2)
  })

  it('卡片被拒絕：回 402 CARD_DECLINED，付款標成 failed，訂單不是 paid', async () => {
    const id = await newOrder(5)
    const res = await pay(id, 'tok_declined')
    expect(res.status, `卡片被拒絕是「確定失敗」，要回 402，得到 ${res.status}：${JSON.stringify(res.body)}`).toBe(402)
    expect(res.body.code).toBe('CARD_DECLINED')
    expect(await paymentOf(id), 'CafePay 明確回答被拒絕，這才是 failed').toBe('failed')
    expect(await orderStatus(id)).not.toBe('paid')
    expect(chargesOf(id).length).toBe(0)
  })
})
