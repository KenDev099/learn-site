// 練習 3：補單 reconcilePayments()，與 webhook 共用 applyPaymentResult()；npm run reconcile 真的能執行
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import pg from 'pg'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { signWebhook, startCafePay } from './cafepay/server.mjs'
import { AppModule } from './api/src/app.module.js'
import { Clock } from './api/src/common/clock.js'
import { CafePayClient, CafePayUnknownError } from './api/src/payments/cafepay.js'
import { PaymentsService } from './api/src/payments/payments.service.js'

const dir = import.meta.dirname
const SECRET = 'whsec_test'
const T0 = new Date('2026-11-08T06:00:00Z')
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000)
let current = T0
let fake: Awaited<ReturnType<typeof startCafePay>>
let app: INestApplication
let service: PaymentsService
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows[0]
const points = async (orderId: number) => Number((await one(`SELECT count(*) FROM point_entries WHERE order_id = $1 AND reason = 'order_paid'`, [orderId])).count)
const paymentOf = async (orderId: number) => (await one('SELECT status FROM payments WHERE order_id = $1', [orderId]))?.status
const orderStatus = async (orderId: number) => (await one('SELECT status FROM orders WHERE id = $1', [orderId]))?.status

// 一筆送出了、還沒有結果的付款（createdAt 由測試決定）
async function waiting(customerId: number, status: 'pending' | 'unknown', createdAt: Date | 'real-11min') {
  const res = await request(app.getHttpServer()).post('/orders').send({ customerId, items: [{ productId: 1, quantity: 2 }] })
  expect(res.status, `建立測試用的訂單失敗：${res.status} ${JSON.stringify(res.body)}`).toBe(201)
  const id = res.body.id as number
  if (createdAt === 'real-11min') await db.query(`INSERT INTO payments (order_id, status, amount, created_at) VALUES ($1, $2, $3, now() - interval '11 minutes')`, [id, status, res.body.total])
  else await db.query('INSERT INTO payments (order_id, status, amount, created_at) VALUES ($1, $2, $3, $4)', [id, status, res.body.total, createdAt])
  return { id, total: res.body.total as number }
}
// 讓 CafePay 那邊真的有這筆扣款（我們的系統沒收到回應、也沒收到 webhook）
async function chargedAtCafePay(orderId: number, amount: number) {
  const res = await fetch(`${fake.url}/v1/payments`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `payment:${orderId}` }, body: JSON.stringify({ orderId, amount, cardToken: 'tok_visa' }) })
  expect(res.status).toBe(201)
}

beforeAll(async () => {
  await db.connect()
  fake = await startCafePay()
  process.env.CAFEPAY_URL = fake.url
  process.env.CAFEPAY_TIMEOUT_MS = '1000'
  process.env.CAFEPAY_WEBHOOK_SECRET = SECRET
  app = await createTestApp(AppModule, {
    override: b => b.overrideProvider(Clock).useValue({ now: () => current }),
    options: { logger: false, rawBody: true },
  })
  service = app.get(PaymentsService)
})
afterAll(async () => {
  await app?.close()
  await fake?.close()
  await db.end()
})

describe('練習 3：補單', () => {
  let x: { id: number, total: number }   // 10:00 送出，CafePay 已扣款，但 webhook 漏了
  let y: { id: number, total: number }   // 10:02 送出，還在等

  it('超過 10 分鐘的付款：查 CafePay，成功的訂單變 paid、點數加一筆', async () => {
    current = T0
    x = await waiting(1, 'unknown', T0)
    await chargedAtCafePay(x.id, x.total)
    y = await waiting(2, 'pending', minutes(2))
    current = minutes(11)
    fake.lookups.length = 0
    const r = await service.reconcilePayments()
    expect(fake.lookups, '補單要向 CafePay 查詢等超過 10 分鐘的付款（GET /v1/payments?orderId=）').toContain(x.id)
    expect(await paymentOf(x.id), 'CafePay 說成功了，付款要變 paid').toBe('paid')
    expect(await orderStatus(x.id), '訂單要變 paid').toBe('paid')
    expect(await points(x.id), '補單也要加點數（跟 webhook 走同一個 applyPaymentResult，規則才不會不一樣）').toBe(1)
    expect(r.checked >= 1 && r.updated >= 1 && r.updated <= r.checked, `reconcilePayments() 要回傳 { checked: 查了幾筆, updated: 改了幾筆 }，得到 ${JSON.stringify(r)}`).toBe(true)
  })

  it('只等了 9 分鐘的付款不去查（webhook 可能還在路上）', () => {
    expect(fake.lookups, `訂單 ${y.id} 的付款才送出 9 分鐘，不應該查詢：要用 Clock 算出「10 分鐘前」當門檻`).not.toContain(y.id)
  })

  it('再執行一次補單：已經 paid 的不再查、不再加點數；晚到的 webhook 也不會再加', async () => {
    fake.lookups.length = 0
    await service.reconcilePayments()
    expect(fake.lookups, '已經 paid 的付款不用再查').not.toContain(x.id)
    const raw = JSON.stringify({ id: 'evt_late_x', type: 'payment.succeeded', created: Math.floor(current.getTime() / 1000), data: { paymentId: 'pay_x', orderId: x.id, amount: x.total } })
    const res = await request(app.getHttpServer()).post('/webhooks/cafepay').set('Content-Type', 'application/json')
      .set('CafePay-Signature', signWebhook(raw, SECRET, Math.floor(current.getTime() / 1000))).send(raw)
    expect(res.status).toBe(200)
    expect(await points(x.id), '補單之後又收到 webhook，點數只能有一筆').toBe(1)
  })

  it('pending 超過 10 分鐘、CafePay 查無這筆付款（請求根本沒送到）：標成 failed，不加點數', async () => {
    current = T0
    const z = await waiting(3, 'pending', T0)
    current = minutes(11)
    await service.reconcilePayments()
    expect(await paymentOf(z.id), '狀態是 pending 的也要查（例如建好付款紀錄後程式就當掉了）；CafePay 查無付款＝沒有扣款，付款標 failed').toBe('failed')
    expect(await orderStatus(z.id)).not.toBe('paid')
    expect(await points(z.id)).toBe(0)
  })

  it('一筆查詢出錯（CafePay 沒回應）不影響其他筆：跳過那一筆，其他筆照樣補上', async () => {
    current = T0
    const bad = await waiting(5, 'unknown', T0)
    const good = await waiting(6, 'unknown', T0)
    await chargedAtCafePay(good.id, good.total)
    const client = app.get(CafePayClient)
    const original = client.findByOrder
    client.findByOrder = async (orderId: number) => {
      if (orderId === bad.id) throw new CafePayUnknownError('測試注入：CafePay 沒有回應')
      return original.call(client, orderId)
    }
    current = minutes(11)
    let error: unknown
    try { await service.reconcilePayments() } catch (e) { error = e } finally { client.findByOrder = original }
    expect(error, `一筆查詢失敗，整個補單就丟出錯誤（${(error as Error)?.message}）：每一筆各自 try/catch，記 log 後跳過，下一輪再查`).toBeUndefined()
    expect(await paymentOf(good.id), '另一筆 CafePay 已扣款的付款要照樣變 paid').toBe('paid')
    expect(await paymentOf(bad.id), '查詢失敗的那一筆不知道結果，要維持 unknown 等下一輪，不能標 failed').toBe('unknown')
  })

  it('npm run reconcile 真的能執行（nest build 之後用真的時間跑一次）', { timeout: 180_000 }, async () => {
    const w = await waiting(4, 'unknown', 'real-11min')
    await chargedAtCafePay(w.id, w.total)
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')))
    // 非同步執行：假 CafePay 跑在這個測試程序裡，同步等待（spawnSync）會讓它沒辦法回應
    const r = await promisify(execFile)('npm', ['run', 'reconcile'], { cwd: dir, encoding: 'utf8', timeout: 170_000, env: { ...env, CAFEPAY_URL: fake.url } })
      .then(o => ({ ok: true, output: o.stdout + o.stderr }), (e: { stdout?: string, stderr?: string, message: string }) => ({ ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` || e.message }))
    expect(r.ok, `npm run reconcile 失敗：\n${r.output.slice(-1500)}`).toBe(true)
    expect(await paymentOf(w.id), 'npm run reconcile 執行完，CafePay 已扣款的付款要變 paid').toBe('paid')
    expect(await points(w.id)).toBe(1)
  })
})
