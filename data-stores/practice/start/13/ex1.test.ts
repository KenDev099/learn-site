import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'
import { dailyRevenue, loadCsv, prepP95, topProducts } from './reports.ts'

// 固定 seed 產生半年的訂單（約 15 萬筆訂單＋30 萬筆明細），再加 2026-07 幾筆手寫的訂單（銷量並列）
const PRICES: Record<number, number> = { 11: 80, 12: 110, 13: 110, 14: 90, 15: 70, 16: 120 }
type Order = { id: number; store: number; customer: number; at: string; day: string; month: string; tenths: number; prep: number; items: [number, number][] }

function seed() {
  let s = 13   // mulberry32：固定 seed 的亂數
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  const orders: Order[] = []
  let id = 10_001
  const add = (day: string, sec: number, ms: number, store: number, customer: number, items: [number, number][], prep: number) => {
    const sub = items.reduce((a, [p, q]) => a + PRICES[p] * q, 0)
    const tenths = customer % 3 === 0 ? sub * 88 / 10 : sub * 10      // 會員 88 折：以「角」（0.1 元）為單位的整數
    const at = `${day} ${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}.${pad(ms, 3)}`
    orders.push({ id: id++, store, customer, at, day, month: day.slice(0, 7), tenths, prep, items })
  }
  for (let d = new Date(Date.UTC(2026, 0, 1)); d < new Date(Date.UTC(2026, 6, 1)); d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10)
    const n = 700 + Math.floor(rnd() * 300)
    for (let i = 0; i < n; i++) {
      const store = 11 + Math.floor(rnd() * 6)
      const lines = 1 + Math.floor(rnd() * 3)
      const items: [number, number][] = []
      for (let k = 0; k < lines; k++) items.push([11 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 3)])
      const sec = i === 0 ? 0 : i === n - 1 ? 86_399 : Math.floor(rnd() * 86_400)   // 每天都有 00:00:00 與 23:59:59 的訂單
      add(day, sec, Math.floor(rnd() * 1000), store, 101 + Math.floor(rnd() * 500), items, 60_000 + Math.floor(rnd() * 600_000) + (store - 11) * 30_000)
    }
  }
  // 2026-07：12 與 14 各賣 7 杯並列第 1，11、13、16 各 5 杯並列第 3
  const july: [number, number][][] = [[[12, 3], [14, 2]], [[12, 4], [11, 5]], [[14, 5], [13, 2]], [[13, 3], [16, 5]], [[15, 3]]]
  july.forEach((items, i) => add(`2026-07-0${i + 1}`, 36_000 + i, 0, 11 + i, 200 + i, items, 300_000 + i * 1000))
  return orders
}

const fmt = (tenths: number) => `${Math.floor(tenths / 10)}.${tenths % 10}`

function expected(orders: Order[]) {
  const days = new Map<string, { orders: number; tenths: number }>()
  const months = new Map<string, Map<number, number>>()
  const preps = new Map<number, number[]>()
  for (const o of orders) {
    const d = days.get(o.day) ?? { orders: 0, tenths: 0 }
    d.orders++; d.tenths += o.tenths; days.set(o.day, d)
    const m = months.get(o.month) ?? new Map<number, number>()
    for (const [p, q] of o.items) m.set(p, (m.get(p) ?? 0) + q)
    months.set(o.month, m)
    preps.set(o.store, [...(preps.get(o.store) ?? []), o.prep])
  }
  const daily = [...days].sort(([a], [b]) => a < b ? -1 : 1).map(([day, v]) => ({ day, orders: v.orders, revenue: fmt(v.tenths) }))
  const top = [...months].sort(([a], [b]) => a < b ? -1 : 1).flatMap(([month, m]) =>
    [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3).map(([product_id, qty], i) => ({ month, product_id, qty, rank: i + 1 })))
  const p95 = [...preps].sort(([a], [b]) => a - b).map(([store_id, xs]) => {
    xs.sort((a, b) => a - b)
    const pos = (xs.length - 1) * 0.95, lo = Math.floor(pos)
    return { store_id, p95_ms: xs[lo] + (xs[Math.min(lo + 1, xs.length - 1)] - xs[lo]) * (pos - lo), disc: xs[Math.ceil(pos)] }
  })
  return { daily, top, p95 }
}

// 只允許呼叫一次 runAndReadAll，並記下 SQL 查出的列數（用來擋「把明細全撈回 Node 再算」）
function watched(duck: DuckDBConnection) {
  const calls: { method: string; rows?: number }[] = []
  const proxy = new Proxy(duck, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target)
      if (typeof v !== 'function') return v
      return (...args: unknown[]) => {
        const call: { method: string; rows?: number } = { method: String(prop) }
        calls.push(call)
        const r = v.apply(target, args)
        return prop === 'runAndReadAll' ? r.then((reader: { currentRowCount: number }) => { call.rows = reader.currentRowCount; return reader }) : r
      }
    },
  })
  return { proxy, calls }
}

function checkCalls(calls: { method: string; rows?: number }[], returned: number) {
  assert.deepEqual(calls.map(c => c.method), ['runAndReadAll'],
    `每個報表只能呼叫一次 duck.runAndReadAll，實際呼叫：${calls.map(c => c.method).join('、') || '（沒有）'}`)
  assert.equal(calls[0].rows, returned,
    `SQL 查出 ${calls[0].rows} 列，函式卻回傳 ${returned} 列：彙總（GROUP BY、視窗函式）要在 DuckDB 裡做完，不要把明細撈回 Node 再算`)
}

describe('練習 1：DuckDB 營運報表', { timeout: 60_000 }, () => {
  const orders = seed()
  const want = expected(orders)
  const dir = mkdtempSync(join(tmpdir(), 'learn-ds13-'))
  let instance: DuckDBInstance
  let duck: DuckDBConnection

  before(async () => {
    writeFileSync(join(dir, 'orders.csv'), 'id,store_id,customer_id,ordered_at,total,prep_ms\n' +
      orders.map(o => `${o.id},${o.store},${o.customer},${o.at},${fmt(o.tenths)},${o.prep}`).join('\n') + '\n')
    writeFileSync(join(dir, 'order_items.csv'), 'order_id,product_id,quantity,unit_price\n' +
      orders.flatMap(o => o.items.map(([p, q]) => `${o.id},${p},${q},${PRICES[p]}`)).join('\n') + '\n')
    instance = await DuckDBInstance.create(':memory:')
    duck = await instance.connect()
  })
  after(() => {
    duck?.closeSync()
    instance?.closeSync()
    rmSync(dir, { recursive: true, force: true })
  })

  test('loadCsv：建立 orders、order_items，筆數正確，total 是 DECIMAL(10,1)', async () => {
    await loadCsv(duck, dir)
    const count = async (t: string) => Number((await duck.runAndReadAll(`SELECT COUNT(*) AS n FROM ${t}`)).getRowObjectsJson()[0].n)
    assert.equal(await count('orders'), orders.length, 'orders 筆數不對：用 read_csv 讀 orders.csv 建表')
    assert.equal(await count('order_items'), orders.reduce((a, o) => a + o.items.length, 0), 'order_items 筆數不對')
    const cols = (await duck.runAndReadAll('DESCRIBE orders')).getRowObjectsJson()
    const type = (name: string) => String(cols.find(c => c.column_name === name)?.column_type)
    assert.equal(type('total'), 'DECIMAL(10,1)',
      `orders.total 的型別是 ${type('total')}：read_csv 會把 96.8 猜成 DOUBLE（二進位浮點數，加總會有誤差），用 columns 或 types 參數指定 DECIMAL(10,1)`)
    assert.equal(type('ordered_at'), 'TIMESTAMP', `orders.ordered_at 的型別是 ${type('ordered_at')}，應該是 TIMESTAMP`)
  })

  test('dailyRevenue：每天的訂單數與精確的營收', async () => {
    const { proxy, calls } = watched(duck)
    const got = await dailyRevenue(proxy)
    checkCalls(calls, got.length)
    assert.equal(got.length, want.daily.length, `應該有 ${want.daily.length} 天，實際 ${got.length} 天`)
    for (let i = 0; i < want.daily.length; i++) {
      assert.deepEqual(got[i], want.daily[i],
        `第 ${i + 1} 列不對：預期 ${JSON.stringify(want.daily[i])}，實際 ${JSON.stringify(got[i])}。日期用 CAST(ordered_at AS DATE)；revenue 是 DECIMAL 的 SUM 轉成的字串，不要經過 JS 的 number 或 DOUBLE`)
    }
  })

  test('topProducts：每個月銷量前 3 名，並列時 product_id 小的優先', async () => {
    const { proxy, calls } = watched(duck)
    const got = await topProducts(proxy)
    checkCalls(calls, got.length)
    const july = want.top.filter(r => r.month === '2026-07')
    assert.deepEqual(got.filter(r => r.month === '2026-07'), july,
      `2026-07 應該是 ${JSON.stringify(july)}：12、14 並列第 1，11、13、16 並列第 3 時取 product_id 最小的 11。用 ROW_NUMBER() OVER (PARTITION BY month ORDER BY qty DESC, product_id)`)
    assert.deepEqual(got, want.top, '每個月都要有自己的前 3 名（7 個月共 21 列），依 month、rank 排序；整體 LIMIT 3 只會得到 3 列')
  })

  test('topProducts：六個商品銷量全部並列時，名次一定依 product_id', async () => {
    // 另一個資料庫：12 個月，每月 6 個商品各賣 2 杯，寫入順序每個月都不同。沒有決勝欄位時，並列的名次由執行順序決定，每次可能不一樣
    const tieDir = mkdtempSync(join(tmpdir(), 'learn-ds13-tie-'))
    const tie = await DuckDBInstance.create(':memory:')
    const conn = await tie.connect()
    try {
      const lines: string[] = []
      const items: string[] = []
      for (let m = 1; m <= 12; m++) {
        const products = [16, 13, 15, 11, 14, 12].map((p, i, a) => a[(i + m) % 6])
        products.forEach((p, i) => {
          const id = m * 100 + i
          lines.push(`${id},11,101,2026-${String(m).padStart(2, '0')}-10 12:00:00.000,${PRICES[p] * 2},60000`)
          items.push(`${id},${p},2,${PRICES[p]}`)
        })
      }
      writeFileSync(join(tieDir, 'orders.csv'), 'id,store_id,customer_id,ordered_at,total,prep_ms\n' + lines.join('\n') + '\n')
      writeFileSync(join(tieDir, 'order_items.csv'), 'order_id,product_id,quantity,unit_price\n' + items.join('\n') + '\n')
      await loadCsv(conn, tieDir)
      const got = await topProducts(conn)
      const want = Array.from({ length: 12 }, (_, i) => [11, 12, 13].map((product_id, r) =>
        ({ month: `2026-${String(i + 1).padStart(2, '0')}`, product_id, qty: 2, rank: r + 1 }))).flat()
      assert.deepEqual(got, want,
        '六個商品都賣 2 杯時，每個月的前 3 名要是 11、12、13：視窗函式的 ORDER BY 要寫 qty DESC, product_id，並列時名次才固定，不會每次執行都不同')
    } finally {
      conn.closeSync()
      tie.closeSync()
      rmSync(tieDir, { recursive: true, force: true })
    }
  })

  test('prepP95：每家門市製作時間的 p95（quantile_cont）', async () => {
    const { proxy, calls } = watched(duck)
    const got = await prepP95(proxy)
    checkCalls(calls, got.length)
    assert.deepEqual(got.map(r => r.store_id), want.p95.map(r => r.store_id), '每家門市一列，依 store_id 排序')
    for (const w of want.p95) {
      const g = got.find(r => r.store_id === w.store_id)!
      assert.ok(Math.abs(g.p95_ms - w.p95_ms) < 1e-6,
        g.p95_ms === w.disc
          ? `門市 ${w.store_id} 的 p95 是 ${g.p95_ms}，這是 quantile_disc 的結果（取最接近的那一筆）；題目要 quantile_cont（在兩筆之間內插），預期 ${w.p95_ms}`
          : `門市 ${w.store_id} 的 p95 預期 ${w.p95_ms}，實際 ${g.p95_ms}：用 quantile_cont(prep_ms, 0.95)`)
    }
  })
})
