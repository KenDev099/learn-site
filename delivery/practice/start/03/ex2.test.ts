// 練習 2：POST /orders 接受 pickupAt；每個時段最多 10 單，並發下也不能超賣
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import pg from 'pg'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './api/src/app.module.js'
import { Clock } from './api/src/common/clock.js'

const clock = { t: 0, now() { return new Date(this.t) } }
const at = (iso: string) => { clock.t = Date.parse(iso) }
const ITEMS = [{ productId: 1, quantity: 1 }]

// 兩個 app 實例連同一個資料庫：就像正式環境開了兩台 API
let appA: INestApplication
let appB: INestApplication
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
const order = (body: object, app = appA) => request(app.getHttpServer()).post('/orders').send({ customerId: 1, items: ITEMS, ...body })
const slotCount = async (iso: string) => Number((await db.query('SELECT orders FROM pickup_slots WHERE slot_start = $1', [iso]).catch(() => ({ rows: [] }))).rows[0]?.orders ?? 0)
const ordersAt = async (iso: string) => Number((await db.query('SELECT count(*) FROM orders WHERE pickup_at = $1', [iso])).rows[0].count)
const orderCount = async () => Number((await db.query('SELECT count(*) FROM orders')).rows[0].count)

beforeAll(async () => {
  await db.connect()
  await db.query('DELETE FROM pickup_slots').catch(() => {})
  const override = { override: (b: Parameters<NonNullable<Parameters<typeof createTestApp>[1]>['override']>[0]) => b.overrideProvider(Clock).useValue(clock) }
  appA = await createTestApp(AppModule, override)
  appB = await createTestApp(AppModule, override)
  await appA.listen(0)   // 先開好 port，20 個並發請求共用同一個 server
  await appB.listen(0)
})
afterAll(async () => {
  await db.end()
  await appA?.close()
  await appB?.close()
})

describe('練習 2：pickupAt 的驗證', () => {
  it('省略 pickupAt：照常下單，pickup_at 是 NULL', async () => {
    at('2026-11-03T08:02:00+08:00')
    const res = await order({})
    expect(res.status, `沒有 pickupAt 的訂單（現點現做）要照常成功，得到 ${res.status}：${JSON.stringify(res.body)}`).toBe(201)
    const row = (await db.query('SELECT pickup_at FROM orders WHERE id = $1', [res.body.id])).rows[0]
    expect(row?.pickup_at, '現點現做的訂單 pickup_at 要是 NULL').toBeNull()
  })

  it('合法的時段：201，orders.pickup_at 存進去，pickup_slots 的 orders 變 1', async () => {
    at('2026-11-03T08:02:00+08:00')
    const res = await order({ pickupAt: '2026-11-03T08:30:00+08:00' })
    expect(res.status, `08:02 選 08:30 要成功，得到 ${res.status}：${JSON.stringify(res.body)}`).toBe(201)
    const row = (await db.query('SELECT pickup_at FROM orders WHERE id = $1', [res.body.id])).rows[0]
    expect(row?.pickup_at?.getTime?.(), 'orders.pickup_at 要存顧客選的時間（2026-11-03T08:30:00+08:00）').toBe(Date.parse('2026-11-03T08:30:00+08:00'))
    expect(await slotCount('2026-11-03T08:30:00+08:00'), 'pickup_slots 裡 08:30 這個時段的 orders 要變成 1').toBe(1)
  })

  it('用 Z 寫的同一個時間也接受（00:45Z＝台北 08:45）', async () => {
    at('2026-11-03T08:02:00+08:00')
    const res = await order({ pickupAt: '2026-11-03T00:45:00Z' })
    expect(res.status, `2026-11-03T00:45:00Z 就是台北 08:45，要接受；先換成同一個時間點再比，得到 ${res.status}：${JSON.stringify(res.body)}`).toBe(201)
  })

  it('剛好 15 分鐘後接受（08:00 選 08:15）', async () => {
    at('2026-11-03T08:00:00+08:00')
    const res = await order({ pickupAt: '2026-11-03T08:15:00+08:00' })
    expect(res.status, `剛好 15 分鐘後要接受（>=，不是 >），得到 ${res.status}：${JSON.stringify(res.body)}`).toBe(201)
  })

  const BAD: [string, string, string][] = [
    ['2026-11-03T08:02:00+08:00', '2026-11-03T08:15:00+08:00', '08:02 選 08:15（只差 13 分鐘）'],
    ['2026-11-03T08:02:00+08:00', '2026-11-03T08:40:00+08:00', '08:40（沒有對齊 15 分鐘）'],
    ['2026-11-03T08:02:00+08:00', '2026-11-03T19:00:00+08:00', '19:00（已經打烊）'],
    ['2026-11-03T06:50:00+08:00', '2026-11-03T07:15:00+08:00', '07:15（還沒開門）'],
    ['2026-11-03T18:00:00+08:00', '2026-11-04T08:00:00+08:00', '明天 08:00（只能預約今天）'],
    ['2026-11-03T08:02:00+08:00', '2026-11-03T08:30:00', '沒有時區位移的 2026-11-03T08:30:00（不同機器會讀成不同時間）'],
    ['2026-11-03T08:02:00+08:00', '明天早上', '不是時間的字串'],
  ]
  for (const [now, pickupAt, why] of BAD) {
    it(`不合規則回 422：${why}`, async () => {
      at(now)
      const before = await orderCount()
      const res = await order({ pickupAt })
      expect(res.status, `${why} 要回 422（不是 ${res.status}）：在 DTO 驗證格式，在 service 用 todaySlots(this.clock.now()) 檢查是不是今天可以選的時段，不是就丟 UnprocessableEntityException`).toBe(422)
      expect(await orderCount(), '被拒絕的訂單不能寫進資料庫').toBe(before)
    })
  }
})

describe('練習 2：每個時段最多 10 單（並發）', () => {
  it('20 個人同時搶 09:00（分別打兩台 API）：正好 10 個成功，其他回 409 SLOT_FULL', async () => {
    at('2026-11-03T08:02:00+08:00')
    const slot = '2026-11-03T09:00:00+08:00'
    const before = await ordersAt(slot)
    const res = await Promise.all(Array.from({ length: 20 }, (_, i) => order({ pickupAt: slot }, i % 2 ? appB : appA)))
    const ok = res.filter(r => r.status === 201).length
    const odd = [...new Set(res.map(r => r.status).filter(s => s !== 201 && s !== 409))]
    expect(odd, `有請求回了 ${odd.join('、')}：除了 201 和 409 不該有別的。500 常見的原因是交易等鎖等到逾時（Prisma 互動式交易預設 5 秒）：把搶時段那一列的步驟放在交易的最後，鎖住的時間才短`).toEqual([])
    expect(ok, `20 個同時送出，成功了 ${ok} 個（應該正好 10 個）。「先查剩幾單再新增」在並發下會超賣；記憶體裡的計數器在兩台 API 各算各的。` +
      '用條件式更新：UPDATE pickup_slots SET orders = orders + 1 WHERE slot_start = … AND orders < 10，看影響了幾列').toBe(10)
    const others = res.filter(r => r.status !== 201)
    for (const r of others) {
      expect(r.status, `額滿要回 409，不是 ${r.status}：${JSON.stringify(r.body)}`).toBe(409)
      expect(r.body?.code, "409 的 body 要有 code: 'SLOT_FULL'，前端靠它分辨「額滿」：throw new ConflictException({ code: 'SLOT_FULL', message: … })").toBe('SLOT_FULL')
    }
    expect(await slotCount(slot), 'pickup_slots 裡 09:00 的 orders 要正好是 10').toBe(10)
    expect(await ordersAt(slot) - before, 'orders 表裡取餐時間 09:00 的訂單要正好多 10 筆').toBe(10)
  })

  it('名額以資料庫為準：09:30 在 pickup_slots 已經有 7 單，再來 20 個只能成功 3 個', async () => {
    at('2026-11-03T08:02:00+08:00')
    const slot = '2026-11-03T09:30:00+08:00'
    await db.query('INSERT INTO pickup_slots (slot_start, orders) VALUES ($1, 7)', [slot])   // 另一台 API 已經接了 7 單
    const res = await Promise.all(Array.from({ length: 20 }, (_, i) => order({ pickupAt: slot }, i % 2 ? appB : appA)))
    const ok = res.filter(r => r.status === 201).length
    expect(ok, `成功了 ${ok} 個（應該是 3 個）：名額要用資料庫的 pickup_slots.orders 判斷，不能用程式裡自己的計數`).toBe(3)
    expect(await slotCount(slot), 'pickup_slots 裡 09:30 的 orders 要停在 10').toBe(10)
  })

  it('佔了名額但訂單寫入失敗：名額要一起回滾', async () => {
    at('2026-11-03T08:02:00+08:00')
    const slot = '2026-11-03T10:00:00+08:00'
    // 拿鐵 110 元 × 2000 萬杯，總價超過 integer 的上限，寫入 orders 時一定失敗
    const res = await order({ pickupAt: slot, items: [{ productId: 2, quantity: 20_000_000 }] })
    expect(res.status, '這筆訂單的總價超過資料庫 integer 的上限，寫入會失敗').toBeGreaterThanOrEqual(400)
    expect(await slotCount(slot), '訂單沒建立，10:00 的名額卻被佔掉了：把「佔名額」和「建立訂單」放在同一個 this.prisma.$transaction(async tx => …) 裡，都用 tx 執行，任何一步失敗就一起回滾').toBe(0)
  })
})
