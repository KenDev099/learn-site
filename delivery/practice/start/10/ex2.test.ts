// 練習 2：CafePay SDK 2.0 的轉接層（cafepay-v2.ts）＋功能旗標 payments.sdk_v2 依訂單 id 穩定分流
// 判分開自己的假 CafePay（隨機 port、逾時 300 毫秒），/v1 是 SDK 1.4.2 打的、/v2 是 2.0.0 打的
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import pg from 'pg'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { startCafePay } from './cafepay/server.mjs'
import { AppModule } from './api/src/app.module.js'
import { Clock } from './api/src/common/clock.js'
import { inRollout } from './api/src/common/feature-flags.js'
import { PaymentsService } from './api/src/payments/payments.service.js'
import { toMinor } from './api/src/payments/cafepay-v2.js'

const FLAG = 'payments.sdk_v2'
type Fake = Awaited<ReturnType<typeof startCafePay>>
let fake: Fake
let app: INestApplication
let now = new Date()
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
const one = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0]
const setFlag = (percent: number) => db.query('UPDATE feature_flags SET percent = $1 WHERE key = $2', [percent, FLAG])
const paymentOf = (orderId: number) => one('SELECT status, sdk FROM payments WHERE order_id = $1', [orderId])
const versionsOf = (orderId: number) => [...new Set(fake.requests.filter(r => r.body.orderId === orderId).map(r => r.version))]
const amountsOf = (orderId: number) => fake.requests.filter(r => r.body.orderId === orderId).map(r => r.body.amount)
const pay = (orderId: number, cardToken = 'tok_visa') => request(app.getHttpServer()).post(`/orders/${orderId}/pay`).send({ cardToken })
const newOrder = async (total = 110) => (await one('INSERT INTO orders (customer_id, total) VALUES (1, $1) RETURNING id', [total])).id as number
const ids = Array.from({ length: 1000 }, (_, i) => i + 1)

beforeAll(async () => {
  await db.connect()
  fake = await startCafePay()
  process.env.CAFEPAY_URL = fake.url
  process.env.CAFEPAY_TIMEOUT_MS = '300'
  process.env.CAFEPAY_WEBHOOK_SECRET = 'whsec_test'
  app = await createTestApp(AppModule, {
    options: { logger: false, rawBody: true },
    override: b => b.overrideProvider(Clock).useValue({ now: () => now }),
  })
})
afterAll(async () => {
  await app?.close()
  await fake?.close()
  await setFlag(0).catch(() => {})
  await db.end()
})

describe('練習 2：分流規則 inRollout()', () => {
  it('0% 全部不在裡面、100% 全部在裡面', () => {
    expect(ids.filter(id => inRollout(FLAG, id, 0)).length, 'percent 是 0 時，任何訂單都不能走新版：這是退回的開關').toBe(0)
    expect(ids.filter(id => inRollout(FLAG, id, 100)).length, 'percent 是 100 時，每一筆都要走新版').toBe(1000)
  })

  it('同一筆訂單問 5 次，答案都一樣（不能用 Math.random()）', () => {
    const unstable = ids.filter(id => new Set(Array.from({ length: 5 }, () => inRollout(FLAG, id, 30))).size > 1)
    expect(unstable.length, `有 ${unstable.length} 筆訂單這次在、下次不在：同一筆訂單的重試會跑到不同版本。要用訂單 id 算（例如雜湊），不能用亂數`).toBe(0)
  })

  it('30% 時，1000 筆訂單裡大約 30% 在裡面（25%～35%）', () => {
    const n = ids.filter(id => inRollout(FLAG, id, 30)).length
    expect(n >= 250 && n <= 350, `1000 筆裡有 ${n} 筆在 30% 裡面`).toBe(true)
  })

  it('百分比調高時，原本在裡面的訂單不會被移出去（10% 的都在 30% 裡）', () => {
    const moved = ids.filter(id => inRollout(FLAG, id, 10) && !inRollout(FLAG, id, 30))
    expect(moved.length, `從 10% 調到 30%，有 ${moved.length} 筆原本走新版的訂單變回舊版。用「桶子編號 < percent」：桶子只跟 key 和 id 有關`).toBe(0)
  })

  it('旗標名稱也算進去：另一個旗標開 10% 時，挑到的不是同一批訂單', () => {
    const a = ids.filter(id => inRollout(FLAG, id, 10)).join()
    const b = ids.filter(id => inRollout('menu.new_layout', id, 10)).join()
    expect(a === b, '兩個不同的旗標都開 10%，挑到的訂單一模一樣：這批客人會先遇到每一個新功能的 bug。雜湊的輸入要包含旗標名稱（例如 `${key}:${id}`）').toBe(false)
  })
})

describe('練習 2：金額換算 toMinor()', () => {
  it('元 → 分，結果是精確的整數（包括有小數的元）', () => {
    for (const [yuan, minor] of [[110, 11000], [1990, 199000], [80, 8000], [19.9, 1990], [0.07, 7], [99.5, 9950]]) {
      const got = toMinor(yuan)
      expect(got, `toMinor(${yuan}) 要是 ${minor}，得到 ${got}。19.9 * 100 在 JavaScript 是 1989.9999999999998：乘完要四捨五入成整數`).toBe(minor)
    }
  })

  it('換不成整數的分（元有三位小數）要丟錯誤，不能默默四捨五入送出去', () => {
    for (const yuan of [1.005, 0.123, Number.NaN]) {
      expect(() => toMinor(yuan), `toMinor(${yuan}) 要丟錯誤：${yuan} 元換不成整數的分，代表上游算錯了，四捨五入會默默收錯錢。檢查「乘以 100 之後」離四捨五入的結果夠不夠近`).toThrow()
    }
  })
})

describe('練習 2：付款依旗標分流', () => {
  it('旗標 0%：走 1.4.2（CafePay 收到 /v1），payments.sdk 是 v1', async () => {
    await setFlag(0)
    const id = await newOrder()
    const res = await pay(id)
    expect(res.status, `付款要成功：${res.status} ${JSON.stringify(res.body)}`).toBe(200)
    expect(versionsOf(id), '0% 時要全部走舊版').toEqual(['v1'])
    expect(amountsOf(id), '1.4.2 的金額單位還是元：110 元要送 110。元換成分只能在 CafePayV2Client 裡做，不要在 PaymentsService 換').toEqual([110])
    expect((await paymentOf(id)).sdk).toBe('v1')
  })

  it('旗標 100%：走 2.0.0（/v2），金額換成分（110 元 → 11000、1990 元 → 199000），payments.sdk 記 v2', async () => {
    await setFlag(100)
    for (const [total, minor] of [[110, 11000], [1990, 199000]]) {
      const id = await newOrder(total)
      const res = await pay(id)
      expect(versionsOf(id), `改了旗標（資料庫的 feature_flags）之後，下一個請求就要照新的值走 v2；收到的版本：${versionsOf(id).join('、') || '沒有呼叫 CafePay'}。旗標要每次從資料庫讀，不能放在環境變數或只在啟動時讀一次`).toEqual(['v2'])
      expect(amountsOf(id), `v2 的 amount 是分的整數：${total} 元要送 ${minor}`).toEqual([minor])
      expect(res.status, `付款要成功：${res.status} ${JSON.stringify(res.body)}`).toBe(200)
      expect(await paymentOf(id), 'payments 要記這筆是用哪一版送出的（sdk: v2），重試和補單才知道要走哪一版').toEqual({ status: 'paid', sdk: 'v2' })
    }
  })

  it('v2 卡片被拒絕（CafePayError card_declined）：回 402 CARD_DECLINED、付款 failed', async () => {
    await setFlag(100)
    const id = await newOrder()
    const res = await pay(id, 'tok_declined')
    expect(res.status, `2.0 用丟出 CafePayError 表示失敗：card_declined 要換回 { status: 'failed' }，API 才會回 402。得到 ${res.status} ${JSON.stringify(res.body)}`).toBe(402)
    expect(res.body.code).toBe('CARD_DECLINED')
    expect((await paymentOf(id)).status).toBe('failed')
  })

  it('改回 0% 立刻生效：下一筆新的付款走 v1', async () => {
    await setFlag(100)
    const a = await newOrder()
    await pay(a)
    await setFlag(0)
    const b = await newOrder()
    await pay(b)
    expect(versionsOf(a)).toEqual(['v2'])
    expect(versionsOf(b), '旗標改回 0 之後的下一個請求就要走 v1：這就是不用部署的退回').toEqual(['v1'])
  })

  it('30%：每筆訂單走哪一版，跟 inRollout("payments.sdk_v2", 訂單 id, 30) 一致', async () => {
    await setFlag(30)
    const orders = []
    for (let i = 0; i < 20; i++) orders.push(await newOrder())
    for (const id of orders) {
      expect((await pay(id)).status).toBe(200)
      const want = inRollout(FLAG, id, 30) ? 'v2' : 'v1'
      expect(versionsOf(id), `訂單 ${id} 應該走 ${want}：付款要用 FeatureFlags（旗標 ${FLAG}、訂單 id）決定版本`).toEqual([want])
      expect((await paymentOf(id)).sdk).toBe(want)
    }
  })

  it('v2 結果不明（202）之後旗標改回 0，重試仍走 v2：同一把 key、只扣一次款、訂單 paid', async () => {
    await setFlag(100)
    const id = await newOrder()
    fake.faults.timeoutAfterCharge = 1
    const first = await pay(id)
    expect(first.status, `2.0 逾時會丟出 CafePayError（network）：要換成 CafePayUnknownError，回 202。得到 ${first.status} ${JSON.stringify(first.body)}`).toBe(202)
    await setFlag(0)
    const retry = await pay(id)
    expect(versionsOf(id), `已經開始的付款要照 payments.sdk 那一版重試，不能重新看旗標：同一把 Idempotency-Key 先送 11000 再送 110，CafePay 會當成不同的付款（422）。收到的版本：${versionsOf(id).join('、')}`).toEqual(['v2'])
    expect(retry.status, `重試要拿到第一次的結果：${retry.status} ${JSON.stringify(retry.body)}`).toBe(200)
    expect(fake.charges.filter(c => c.orderId === id).length).toBe(1)
  })

  it('補單照每筆付款的 sdk 查詢：v2 已扣款的變 paid，v2 查無付款的（CafePayError not_found）變 failed', async () => {
    await setFlag(100)
    const charged = await newOrder()
    fake.faults.timeoutAfterCharge = 1
    expect((await pay(charged)).status).toBe(202)
    const lost = await newOrder()
    await db.query(`INSERT INTO payments (order_id, status, amount, created_at, sdk) VALUES ($1, 'pending', 110, now(), 'v2')`, [lost])
    await setFlag(0)
    now = new Date(Date.now() + 11 * 60_000)
    try {
      await app.get(PaymentsService).reconcilePayments()
    } finally {
      now = new Date()
    }
    const asked = [...new Set(fake.lookupLog.filter(l => l.orderId === charged || l.orderId === lost).map(l => l.version))]
    expect(asked, `補單要照每筆付款的 sdk 欄位選 SDK（這兩筆是 v2），實際查詢用的版本：${asked.join('、') || '沒有查詢'}`).toEqual(['v2'])
    expect((await paymentOf(charged)).status, 'CafePay 說成功就是 paid').toBe('paid')
    expect((await paymentOf(lost)).status, '2.0 查無付款會丟出 CafePayError（not_found）：findByOrder 要換回 { status: "not_found" }，補單才會標 failed').toBe('failed')
  })
})
