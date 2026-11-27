// 練習 2：POST /orders/:id/cancel。打真的 API、真的資料庫與假 CafePay
import type { INestApplication } from '@nestjs/common'
import pg from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from '../../helpers/app.ts'
import { startCafePay } from './cafepay/server.mjs'
import { AppModule } from './api/src/app.module.js'

type Fake = Awaited<ReturnType<typeof startCafePay>>
let fake: Fake
let app: INestApplication
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
const SLOT = '2026-11-20T01:00:00.000Z'

async function login(username: string, password: string) {
  const agent = request.agent(app.getHttpServer())
  const res = await agent.post('/auth/login').send({ username, password })
  expect(res.status, `示範帳號 ${username} 登入失敗（${res.status}）：不要改 auth 模組與種子資料的帳號`).toBe(200)
  return agent
}
// 付好款的訂單：一杯拿鐵 110 元，經過真的付款流程（假 CafePay 扣款、送 11 點）
async function paidOrder(customerId: number, pickupAt: string | null = null) {
  const { rows } = await db.query('INSERT INTO orders (customer_id, total, pickup_at) VALUES ($1, 110, $2) RETURNING id', [customerId, pickupAt])
  const id: number = rows[0].id
  await db.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, 2, 1, 110)', [id])
  if (pickupAt) await db.query('INSERT INTO pickup_slots (slot_start, orders) VALUES ($1, 1) ON CONFLICT (slot_start) DO UPDATE SET orders = pickup_slots.orders + 1', [pickupAt])
  const res = await request(app.getHttpServer()).post(`/orders/${id}/pay`).send({ cardToken: 'tok_visa' })
  expect(res.status, `準備測試用的已付款訂單失敗：付款回 ${res.status} ${JSON.stringify(res.body)}。付款流程（payments/）不要改壞`).toBe(200)
  return id
}
const one = async (sql: string, args: unknown[]) => (await db.query(sql, args)).rows[0]
const statusOf = async (id: number) => (await one('SELECT status FROM orders WHERE id = $1', [id]))?.status
const providerOf = async (id: number) => (await one('SELECT provider_id FROM payments WHERE order_id = $1', [id]))?.provider_id
const refundsOf = async (id: number) => { const p = await providerOf(id); return fake.refunds.filter(r => r.paymentId === p) }
const pointsOf = async (id: number) => (await db.query('SELECT id, points, reason, reversal_of FROM point_entries WHERE order_id = $1 ORDER BY id', [id])).rows
const slotOrders = async () => Number((await one('SELECT orders FROM pickup_slots WHERE slot_start = $1', [SLOT]))?.orders)
const start = (id: number) => request(app.getHttpServer()).post(`/orders/${id}/start`)

beforeAll(async () => {
  process.env.SESSION_SECRET = 'grading-secret'
  await db.connect()
  fake = await startCafePay()
  process.env.CAFEPAY_URL = fake.url
  process.env.CAFEPAY_TIMEOUT_MS = '300'
  app = await createTestApp(AppModule, { options: { logger: false, rawBody: true } })
})
afterAll(async () => {
  await app?.close()
  await fake?.close()
  await db.end()
})

describe('練習 2：取消訂單的 API', () => {
  it('本人取消付好款的訂單：200、cancelled、退款一筆（110 元）、點數用補償紀錄扣回、時段空出一個名額', async () => {
    const id = await paidOrder(3, SLOT)
    const before = await slotOrders()
    const customer3 = await login('customer3', 'latte-3')
    const res = await customer3.post(`/orders/${id}/cancel`)
    expect(res.status, `POST /orders/${id}/cancel 要回 200（Nest 的 @Post 預設是 201，要加 @HttpCode(200)），得到 ${res.status} ${JSON.stringify(res.body)}`).toBe(200)
    expect(res.body.status, '回應是取消後的訂單（跟 GET /orders/:id 同一個格式），status 是 cancelled').toBe('cancelled')
    expect(await statusOf(id), '資料庫裡的訂單要變成 cancelled').toBe('cancelled')
    const refunds = await refundsOf(id)
    expect(refunds.length, `CafePay 要剛好退一次款，現在是 ${refunds.length} 次。退款用 CafePayV2Client.refund()`).toBe(1)
    expect(refunds[0].amount, '要全額退款：110 元（refund() 收的是元，它自己換成分）').toBe(110)
    const points = await pointsOf(id)
    const earned = points.find(p => p.reason === 'order_paid')
    expect(earned, '付款時送的 order_paid 點數紀錄不見了：點數只新增、不修改也不刪除，要寫一筆負的補償紀錄抵銷它').toBeDefined()
    const reversal = points.find(p => p.points < 0)
    expect(reversal?.reversal_of, '要有一筆負的補償紀錄，reversal_of 指向原本的 order_paid 那一筆').toBe(earned.id)
    expect(points.reduce((s, p) => s + p.points, 0), '這張訂單的點數加總要是 0').toBe(0)
    expect(await slotOrders(), `取餐時段的名額要空出一個：取消前 ${before}，取消後應該是 ${before - 1}`).toBe(before - 1)
  })

  it('吧台已經開始製作：409 ORDER_NOT_CANCELLABLE，訂單不變、不退款', async () => {
    const id = await paidOrder(3)
    expect((await start(id)).status, '準備測試資料：POST /orders/:id/start 要成功。不要改 kitchen 模組').toBe(200)
    const res = await (await login('customer3', 'latte-3')).post(`/orders/${id}/cancel`)
    expect(res.status, `製作中的訂單取消要回 409，得到 ${res.status}`).toBe(409)
    expect(res.body.code, 'code 要是 ORDER_NOT_CANCELLABLE').toBe('ORDER_NOT_CANCELLABLE')
    expect(await statusOf(id), '訂單要維持 preparing').toBe('preparing')
    expect((await refundsOf(id)).length, '不能退款').toBe(0)
  })

  it('還沒付款（pending）的訂單：409 ORDER_NOT_CANCELLABLE，訂單維持 pending', async () => {
    const { rows } = await db.query('INSERT INTO orders (customer_id, total) VALUES (3, 110) RETURNING id')
    const id: number = rows[0].id
    const res = await (await login('customer3', 'latte-3')).post(`/orders/${id}/cancel`)
    expect(res.status, `會議紀錄：還沒付款的訂單不能取消（之後由 CAFE-51 自動作廢）。只有 paid 能改成 cancelled，得到 ${res.status}`).toBe(409)
    expect(res.body.code, 'code 要是 ORDER_NOT_CANCELLABLE').toBe('ORDER_NOT_CANCELLABLE')
    expect(await statusOf(id), '訂單要維持 pending').toBe('pending')
  })

  it('沒登入 401；別人的訂單 404，訂單不變、不退款', async () => {
    const id = await paidOrder(3)
    const anonymous = await request(app.getHttpServer()).post(`/orders/${id}/cancel`)
    expect(anonymous.status, `沒登入要回 401（加 @UseGuards(LoginGuard)），得到 ${anonymous.status}`).toBe(401)
    const other = await (await login('customer2', 'latte-2')).post(`/orders/${id}/cancel`)
    expect(other.status, `2 號顧客取消 3 號顧客的訂單要回 404（跟 GET /orders/:id 一樣用 findVisible），得到 ${other.status}`).toBe(404)
    expect(await statusOf(id), '別人的訂單不能被取消').toBe('paid')
    expect((await refundsOf(id)).length, '別人的訂單不能退款').toBe(0)
  })

  it('同一張訂單同時送 10 次取消：都回 200，只退一次款、只扣一次點數、名額只空出一個', async () => {
    const id = await paidOrder(5, SLOT)
    const before = await slotOrders()
    const customer5 = await login('customer5', 'latte-5')
    const results = await Promise.all(Array.from({ length: 10 }, () => customer5.post(`/orders/${id}/cancel`)))
    const codes = results.map(r => r.status)
    expect(codes.every(c => c === 200), `10 次都要回 200（已經取消過的回目前的訂單，不是錯誤），得到 ${codes.join(', ')}`).toBe(true)
    expect((await refundsOf(id)).length, `退了 ${(await refundsOf(id)).length} 次款：只能退一次`).toBe(1)
    expect((await pointsOf(id)).filter(p => p.points < 0).length, '補償紀錄只能有一筆').toBe(1)
    expect(await slotOrders(), `名額只能空出一個：取消前 ${before}，現在 ${await slotOrders()}`).toBe(before - 1)
  })

  it('退款逾時（結果不明）後再取消一次：用同一把 Idempotency-Key 重試，CafePay 只退一次款', async () => {
    const id = await paidOrder(6)
    const customer6 = await login('customer6', 'latte-6')
    fake.faults.timeoutAfterRefund = 1
    const first = await customer6.post(`/orders/${id}/cancel`)
    expect(first.status, `退款逾時時訂單已經取消，要回 200（不要回 500），得到 ${first.status} ${JSON.stringify(first.body)}`).toBe(200)
    const again = await customer6.post(`/orders/${id}/cancel`)
    expect(again.status, `再取消一次要回 200，得到 ${again.status}`).toBe(200)
    const provider = await providerOf(id)
    const requests = fake.refundRequests.filter(r => r.body.paymentId === provider)
    expect(requests.length, '上一次退款結果不明，再取消一次時要再呼叫一次退款（同一把 key 問結果），不能當作已經退過了').toBeGreaterThanOrEqual(2)
    const keys = [...new Set(requests.map(r => r.key))]
    expect(keys.length, `每次退款請求要用同一把 Idempotency-Key（從訂單 id 推出來，例如 refund:<訂單 id>），收到：${keys.join('、')}`).toBe(1)
    expect(keys[0], 'Idempotency-Key 要包含訂單 id').toContain(String(id))
    expect((await refundsOf(id)).length, 'CafePay 只能退一次款').toBe(1)
  })

  it('吧台先開始製作、交易還沒提交時客人取消：吧台提交後，取消要回 409，訂單維持 preparing、不退款', async () => {
    const id = await paidOrder(3)
    const customer3 = await login('customer3', 'latte-3')
    // 另一條連線扮演吧台：把訂單改成 preparing，但先不提交，這一列的鎖還在它手上
    const kitchen = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await kitchen.connect()
    try {
      await kitchen.query('BEGIN')
      await kitchen.query("UPDATE orders SET status = 'preparing' WHERE id = $1 AND status = 'paid'", [id])
      const cancelling = customer3.post(`/orders/${id}/cancel`).then(r => r)
      // 等取消的請求卡在這一列的鎖上（最多 3 秒），再讓吧台提交
      for (let i = 0; i < 60; i++) {
        const { rows } = await db.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'")
        if (rows[0].n > 0) break
        await new Promise(r => setTimeout(r, 50))
      }
      await kitchen.query('COMMIT')
      const res = await cancelling
      expect(res.status, `吧台已經開始製作，取消要回 409，得到 ${res.status}。先讀到 paid、再無條件改成 cancelled 的寫法，會蓋掉吧台的修改：把 status = 'paid' 放進 UPDATE 的 WHERE，看影響了幾列`).toBe(409)
      expect(await statusOf(id), '訂單要維持 preparing：吧台已經在做了').toBe('preparing')
      expect((await refundsOf(id)).length, '不能退款：取消沒有成功').toBe(0)
    } finally {
      await kitchen.end()
    }
  })

  it('取消和開始製作同時送出 20 次：每次只有一方成功，結果跟成功的那一方一致', async () => {
    const customer4 = await login('customer4', 'latte-4')
    for (let i = 0; i < 20; i++) {
      const id = await paidOrder(4)
      const [cancel, started] = await Promise.all([customer4.post(`/orders/${id}/cancel`), start(id)])
      const winners = [cancel.status, started.status].filter(s => s === 200).length
      expect(winners, `第 ${i + 1} 次：取消回 ${cancel.status}、開始製作回 ${started.status}，兩個都成功了。改狀態要用條件式更新（WHERE status = 'paid'，看影響了幾列），不能先查再改`).toBe(1)
      const status = await statusOf(id)
      const refunds = (await refundsOf(id)).length
      if (cancel.status === 200) expect([status, refunds], `第 ${i + 1} 次取消成功：訂單要是 cancelled、退款一次`).toEqual(['cancelled', 1])
      else expect([status, refunds, cancel.body.code], `第 ${i + 1} 次開始製作成功：訂單是 preparing、沒有退款，取消回 409 ORDER_NOT_CANCELLABLE`).toEqual(['preparing', 0, 'ORDER_NOT_CANCELLABLE'])
    }
  })
})
