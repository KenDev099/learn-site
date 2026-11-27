// 練習 1：pickup_slots 的 migration ＋ GET /pickup-slots
// 測試程序跑在 TZ=UTC（跟正式機一樣），「現在」由測試用 Clock 固定，不看真的時間
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { INestApplication } from '@nestjs/common'
import pg from 'pg'
import request from 'supertest'
import { createTestApp } from '../../helpers/app.ts'
import { AppModule } from './api/src/app.module.js'
import { Clock } from './api/src/common/clock.js'

const dir = import.meta.dirname
const MIN = 60_000
const clock = { t: Date.parse('2026-11-03T08:02:00+08:00'), now() { return new Date(this.t) } }
const at = (iso: string) => { clock.t = Date.parse(iso) }

// 台北時間 HH:mm（台灣全年 +08:00）
const hhmm = (ms: number) => new Date(ms + 8 * 60 * MIN).toISOString().slice(11, 16)
// 正確答案：台北 date 當天 07:30–18:45、至少 15 分鐘後、15 分鐘一格
function expected(nowIso: string, date: string) {
  const now = Date.parse(nowIso), out: number[] = []
  for (let t = Date.parse(`${date}T07:30:00+08:00`); t <= Date.parse(`${date}T18:45:00+08:00`); t += 15 * MIN) if (t - now >= 15 * MIN) out.push(t)
  return out
}

type Slot = { start: string; label: string; remaining: number }
let app: INestApplication
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
const get = async () => {
  const res = await request(app.getHttpServer()).get('/pickup-slots')
  expect(res.status, `GET /pickup-slots 回 ${res.status}：${JSON.stringify(res.body)}`).toBe(200)
  expect(Array.isArray(res.body), 'GET /pickup-slots 要回陣列 [{ start, label, remaining }, …]').toBe(true)
  return res.body as Slot[]
}

beforeAll(async () => {
  await db.connect()
  app = await createTestApp(AppModule, { override: b => b.overrideProvider(Clock).useValue(clock) })
})
afterAll(async () => {
  await db.query('DELETE FROM pickup_slots').catch(() => {})
  await db.end()
  await app?.close()
})

describe('練習 1：migration', () => {
  it('既有的 migration 檔沒有被改過', () => {
    const hash = (f: string) => createHash('sha256').update(readFileSync(join(dir, 'api/prisma/migrations', f, 'migration.sql'))).digest('hex')
    expect(hash('20261102000000_init'), '20261102000000_init/migration.sql 被改過了：已經套用到正式資料庫的 migration 不能改，改了也不會再跑一次。改回原樣，新的變更一律開新的 migration（npx prisma migrate dev --name …）').toBe('1bc7ce8bdaf7db2cab1203c6a357bd0bb410ded325e5ac4743918f4ad4b94c8a')
    expect(hash('20261102000100_products_legacy_sku'), '20261102000100_products_legacy_sku/migration.sql 被改過了：改回原樣，新的變更開新的 migration').toBe('686d74a3d42e87fab121f9dda17b2098df00f94458f2eb5aeaad000492522b07')
  })

  const column = async (table: string, col: string) => (await db.query(
    'SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2', [table, col])).rows[0]

  it('orders.pickup_at 是 timestamptz、可以是 NULL（跟著做的那一步）', async () => {
    const c = await column('orders', 'pickup_at')
    expect(c, 'orders 沒有 pickup_at 欄位：先照「跟著做」在 schema.prisma 的 Order 加 pickupAt，再執行 npx prisma migrate dev --name pickup-at').toBeDefined()
    expect(c.data_type, 'pickup_at 要是 timestamp with time zone（Prisma 寫 @db.Timestamptz(3)），不帶時區的 timestamp 會在不同時區的機器上被讀成不同的時間').toBe('timestamp with time zone')
    expect(c.is_nullable, 'pickup_at 要可以是 NULL（DateTime?）：舊訂單和現點現做的訂單沒有取餐時間').toBe('YES')
  })

  it('pickup_slots(slot_start timestamptz 主鍵, orders int NOT NULL DEFAULT 0)', async () => {
    const s = await column('pickup_slots', 'slot_start'), o = await column('pickup_slots', 'orders')
    expect(s, '找不到 pickup_slots.slot_start：在 schema.prisma 加 model PickupSlot（@@map("pickup_slots")），再開一個新的 migration').toBeDefined()
    expect(s.data_type, 'slot_start 要是 timestamp with time zone（@db.Timestamptz(3)）').toBe('timestamp with time zone')
    expect(o, '找不到 pickup_slots.orders 欄位').toBeDefined()
    expect([o.data_type, o.is_nullable, o.column_default], 'orders 要是 integer、NOT NULL、預設 0（Int @default(0)）').toEqual(['integer', 'NO', '0'])
    const pk = (await db.query(`SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'pickup_slots'::regclass AND i.indisprimary`)).rows.map(r => r.attname)
    expect(pk, 'pickup_slots 的主鍵要是 slot_start（@id）：一個時段只能有一列').toEqual(['slot_start'])
  })
})

describe('練習 1：GET /pickup-slots', () => {
  const check = (slots: Slot[], want: number[], when: string) => {
    expect(slots.map(s => Date.parse(s.start)), `${when}：時段不對。台北時間今天 07:30–18:45、離「現在」至少 15 分鐘、每 15 分鐘一格。` +
      `你回 ${slots.slice(0, 3).map(s => s.start).join('、')}…（共 ${slots.length} 個），應該從 ${want.length ? new Date(want[0]).toISOString() : '（沒有）'} 開始共 ${want.length} 個。「現在」要從 Clock 拿，日期要換成台北時間算`).toEqual(want)
    for (const s of slots) expect(s.label, `${s.start} 的 label 要是台北時間 ${hhmm(Date.parse(s.start))}（HH:mm）。伺服器跑在 UTC：getHours()、沒指定 timeZone 的 toLocaleTimeString() 都會差 8 小時，用 Intl.DateTimeFormat 指定 timeZone: 'Asia/Taipei'`).toBe(hhmm(Date.parse(s.start)))
  }

  it('台北 08:02：第一個時段是 08:30，最後一個是 18:45，label 是台北時間', async () => {
    await db.query('DELETE FROM pickup_slots').catch(() => {})
    at('2026-11-03T08:02:00+08:00')
    const slots = await get()
    check(slots, expected('2026-11-03T08:02:00+08:00', '2026-11-03'), '台北 08:02')
    expect(slots[0]?.label, '08:02 送出最早能選 08:30（08:15 只差 13 分鐘）').toBe('08:30')
    expect(slots.every(s => s.remaining === 10), '還沒有人預約時，每個時段 remaining 都是 10').toBe(true)
  })

  it('台北 07:00（UTC 還是前一天 23:00）：列的是台北的今天 07:30 起', async () => {
    at('2026-11-02T23:00:00Z')
    check(await get(), expected('2026-11-02T23:00:00Z', '2026-11-03'), '台北 2026-11-03 07:00（2026-11-02T23:00Z）')
  })

  it('換一天、剛好差 15 分鐘：台北 2026-12-25 10:00 的第一個時段是 10:15', async () => {
    at('2026-12-25T10:00:00+08:00')
    const slots = await get()
    check(slots, expected('2026-12-25T10:00:00+08:00', '2026-12-25'), '台北 2026-12-25 10:00')
    expect(slots[0]?.label, '剛好 15 分鐘後的時段要列出來（>=，不是 >）；日期要從 now 算，不能寫死 2026-11-03').toBe('10:15')
  })

  it('台北 18:40：今天已經沒有時段，回空陣列', async () => {
    at('2026-11-03T18:40:00+08:00')
    expect((await get()).length, '18:40 加 15 分鐘是 18:55，已經超過最後一個時段 18:45，要回 []').toBe(0)
  })

  it('remaining 是 10 減掉 pickup_slots.orders；額滿的時段也要列出來（remaining 0）', async () => {
    at('2026-11-03T08:02:00+08:00')
    // 2026-11-02 09:15 是昨天的時段，跟今天 09:15 同一個「HH:mm」，但不是同一個時間點
    await db.query(`INSERT INTO pickup_slots (slot_start, orders) VALUES ('2026-11-03T09:00:00+08:00', 10), ('2026-11-03T09:15:00+08:00', 3), ('2026-11-02T09:15:00+08:00', 10)`)
    const slots = await get()
    const find = (iso: string) => slots.find(s => Date.parse(s.start) === Date.parse(iso))
    expect(find('2026-11-03T09:00:00+08:00')?.remaining, '09:00 已經有 10 單：還是要列出來，remaining 是 0（畫面才能顯示成不能選）').toBe(0)
    expect(find('2026-11-03T09:15:00+08:00')?.remaining, '今天 09:15 已經有 3 單：remaining 是 7。用 pickup_slots 的 orders 算，用時間點（getTime()）對應，不要用 HH:mm 對應：昨天 09:15 的那一列不算').toBe(7)
    expect(find('2026-11-03T09:30:00+08:00')?.remaining, 'pickup_slots 沒有那一列的時段（還沒人選過）remaining 是 10').toBe(10)
  })
})
