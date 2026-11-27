// 練習 2：webhook 冪等、不怕亂序，而且在同一個交易裡
// 判分開兩個 API 實例（正式環境通常不只一台），同一個通知同時送到兩台
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import pg from 'pg'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { signWebhook } from './cafepay/server.mjs'
import { AppModule } from './api/src/app.module.js'

const SECRET = 'whsec_test'
let apps: INestApplication[] = []
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0]
const points = async (orderId: number) => Number((await one(`SELECT count(*) FROM point_entries WHERE order_id = $1 AND reason = 'order_paid'`, [orderId])).count)
const processed = async (eventId: string) => Number((await one('SELECT count(*) FROM processed_events WHERE event_id = $1', [eventId])).count)
const paymentOf = async (orderId: number) => (await one('SELECT status FROM payments WHERE order_id = $1', [orderId]))?.status
const orderStatus = async (orderId: number) => (await one('SELECT status FROM orders WHERE id = $1', [orderId]))?.status

// 一張已經送出付款、還在等結果（unknown）的訂單
async function unknownPayment(customerId: number) {
  const res = await request(apps[0].getHttpServer()).post('/orders').send({ customerId, items: [{ productId: 6, quantity: 1 }] })
  expect(res.status, `建立測試用的訂單失敗：${res.status} ${JSON.stringify(res.body)}`).toBe(201)
  await db.query(`INSERT INTO payments (order_id, status, amount, created_at) VALUES ($1, 'unknown', $2, now())`, [res.body.id, res.body.total])
  return res.body.id as number
}
const event = (id: string, type: string, orderId: number, created: number) =>
  ({ id, type, created, data: { paymentId: `pay_${orderId}`, orderId, amount: 120 } })
function send(app: INestApplication, e: object) {
  const raw = JSON.stringify(e)
  return request(app.getHttpServer()).post('/webhooks/cafepay')
    .set('Content-Type', 'application/json').set('CafePay-Signature', signWebhook(raw, SECRET)).send(raw)
}
const now = () => Math.floor(Date.now() / 1000)

beforeAll(async () => {
  await db.connect()
  process.env.CAFEPAY_URL = 'http://localhost:9'   // 這題不會呼叫 CafePay
  process.env.CAFEPAY_WEBHOOK_SECRET = SECRET
  for (let i = 0; i < 2; i++) apps.push(await createTestApp(AppModule, { options: { logger: false, rawBody: true } }))
  // 暖機：先把兩台的資料庫連線建好，之後的請求才會真的同時發生
  await Promise.all(apps.flatMap(a => Array.from({ length: 5 }, () => request(a.getHttpServer()).get('/products'))))
})
afterAll(async () => {
  await db.query('DROP TRIGGER IF EXISTS learn_fail_points ON point_entries').catch(() => {})
  await db.query('DROP FUNCTION IF EXISTS learn_fail_points()').catch(() => {})
  await Promise.all(apps.map(a => a.close()))
  await db.end()
})

describe('練習 2：webhook 冪等且不怕亂序', () => {
  it('同一個 payment.succeeded 同時送 6 次（分給兩台）：都回 2xx，訂單 paid、點數只加一次、processed_events 一筆', async () => {
    const id = await unknownPayment(1)
    const e = event('evt_dup_1', 'payment.succeeded', id, now())
    const res = await Promise.all(Array.from({ length: 6 }, (_, i) => send(apps[i % 2], e)))
    const codes = res.map(r => r.status)
    expect(codes.every(c => c >= 200 && c < 300), `重複的通知也要回 2xx（已經處理過＝成功），否則 CafePay 會一直重送。得到 ${codes.join(', ')}。先查再新增在同時送達時會撞到唯一約束變成 500`).toBe(true)
    expect(await paymentOf(id)).toBe('paid')
    expect(await orderStatus(id)).toBe('paid')
    expect(await points(id), '同一個事件送了 6 次，點數只能加 1 次。去重要靠資料庫（兩台 API 不共用記憶體）').toBe(1)
    expect(await processed('evt_dup_1'), '處理過的事件要記在 processed_events，而且只有一筆').toBe(1)
  })

  it('paid 之後才收到比較舊的 payment.failed：回 2xx，付款仍是 paid、點數不變', async () => {
    const id = await unknownPayment(2)
    expect((await send(apps[0], event('evt_ok_2', 'payment.succeeded', id, now()))).status).toBe(200)
    const late = await send(apps[1], event('evt_old_2', 'payment.failed', id, now() - 60))
    expect(late.status, `晚到的通知照樣回 2xx，得到 ${late.status}`).toBeLessThan(300)
    expect(await paymentOf(id), '晚到的 failed 蓋掉了 paid：paid 是終點，之後的 failed 不能改它').toBe('paid')
    expect(await orderStatus(id)).toBe('paid')
    expect(await points(id)).toBe(1)
  })

  it('另一個事件說同一筆付款成功（例如 CafePay 補送了新的事件編號）：點數仍只有一筆', async () => {
    const id = await unknownPayment(3)
    await send(apps[0], event('evt_a_3', 'payment.succeeded', id, now()))
    await send(apps[1], event('evt_b_3', 'payment.succeeded', id, now()))
    expect(await points(id), '不同事件編號、同一筆付款成功兩次：狀態已經是 paid 時不能再加點數').toBe(1)
  })

  it('處理到一半出錯（寫點數失敗）：回 5xx，狀態、點數、processed_events 都沒有寫入；CafePay 重送後才完成', async () => {
    const id = await unknownPayment(4)
    await db.query(`CREATE OR REPLACE FUNCTION learn_fail_points() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.order_id = ${id} THEN RAISE EXCEPTION 'learn: 測試注入的錯誤'; END IF; RETURN NEW; END $$`)
    await db.query('CREATE TRIGGER learn_fail_points BEFORE INSERT ON point_entries FOR EACH ROW EXECUTE FUNCTION learn_fail_points()')
    const e = event('evt_fail_4', 'payment.succeeded', id, now())
    const first = await send(apps[0], e)
    await db.query('DROP TRIGGER learn_fail_points ON point_entries')
    expect(first.status, `處理失敗時要回 5xx，CafePay 才會重送；得到 ${first.status}`).toBeGreaterThanOrEqual(500)
    expect(await paymentOf(id), '點數寫失敗了，付款狀態卻已經改成 paid：狀態、點數、processed_events 要在同一個交易裡').toBe('unknown')
    expect(await orderStatus(id), '點數寫失敗了，訂單狀態卻已經改了：要在同一個交易裡').not.toBe('paid')
    expect(await processed('evt_fail_4'), '處理失敗了卻已經記成「處理過」：重送時會被當成重複略過，這筆付款永遠不會完成').toBe(0)
    const retry = await send(apps[1], e)
    expect(retry.status, `重送要成功，得到 ${retry.status}`).toBe(200)
    expect(await paymentOf(id)).toBe('paid')
    expect(await points(id)).toBe(1)
  })

  it('簽章不對的通知回 401，不處理', async () => {
    const id = await unknownPayment(5)
    const raw = JSON.stringify(event('evt_forged', 'payment.succeeded', id, now()))
    const res = await request(apps[0].getHttpServer()).post('/webhooks/cafepay')
      .set('Content-Type', 'application/json').set('CafePay-Signature', signWebhook(raw, 'wrong-secret')).send(raw)
    expect(res.status).toBe(401)
    expect(await paymentOf(id)).toBe('unknown')
  })
})
