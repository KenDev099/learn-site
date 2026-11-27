import test from 'node:test'
import assert from 'node:assert/strict'

type Order = { id: number, customerId: number, total: number, at: number }
type Customer = { id: number, name: string }
type Row = { customerId: number, name: string, orders: number, total: number, lastAt: number }
type BuildReport = (orders: Order[], customers: Customer[]) => { rows: Row[], unknownOrders: number }

const NAMES = ['王小明', '陳美華', '林志豪', '張雅婷', '李建國', '黃淑芬']

// 隨機的客人與訂單：客人編號打亂、有沒下過單的客人、也有客人資料被刪掉的訂單
function makeData(customerCount: number, orderCount: number) {
  const ids = new Set<number>()
  while (ids.size < customerCount) ids.add(1 + Math.floor(Math.random() * customerCount * 20))
  const customers: Customer[] = [...ids].map(id => ({ id, name: `${NAMES[id % NAMES.length]}${id}` }))
  const orders: Order[] = []
  for (let i = 0; i < orderCount; i++) {
    const customerId = Math.random() < 0.03 ? -1 - Math.floor(Math.random() * 1000) : customers[Math.floor(Math.random() * customers.length * 0.9)].id
    orders.push({ id: i + 1, customerId, total: 70 + Math.floor(Math.random() * 500), at: 1_790_000_000_000 + Math.floor(Math.random() * 1e9) })
  }
  return { orders, customers }
}

// 參考實作：和原本的 buildReport 輸出相同
function expected(orders: Order[], customers: Customer[]) {
  const by = new Map<number, Order[]>()
  for (const o of orders) by.set(o.customerId, [...(by.get(o.customerId) ?? []), o])
  const rows: Row[] = []
  let known = 0
  for (const c of customers) {
    const mine = by.get(c.id)
    if (!mine) continue
    known += mine.length
    rows.push({ customerId: c.id, name: c.name, orders: mine.length, total: mine.reduce((s, o) => s + o.total, 0), lastAt: mine.reduce((m, o) => Math.max(m, o.at), 0) })
  }
  return { rows, unknownOrders: orders.length - known }
}

async function load() {
  const mod: { buildReport?: unknown } = await import('./report.ts')
  assert.equal(typeof mod.buildReport, 'function', 'report.ts 要 export buildReport')
  return mod.buildReport as BuildReport
}

test('輸出和原本完全相同（隨機資料、順序照 customers），不能改動傳進來的陣列', { timeout: 15_000 }, async () => {
  const buildReport = await load()
  for (let i = 0; i < 5; i++) {
    const { orders, customers } = makeData(50 + i * 30, 400 + i * 200)
    const want = expected(orders, customers)
    const before = structuredClone({ orders, customers })
    assert.deepEqual(buildReport(orders, customers), want,
      'rows 要照 customers 的順序、沒有訂單的客人不列；unknownOrders 是 customerId 不在 customers 裡的訂單數')
    assert.deepEqual({ orders, customers }, before, 'buildReport 不能改動傳進來的 orders、customers（例如就地排序、刪除、改欄位）：呼叫端還要用它們')
  }
})

test('5 萬筆訂單、5 千位客人在 200ms 內完成（3 組不同的資料，取中位數）', { timeout: 15_000 }, async () => {
  const buildReport = await load()
  const times: number[] = []
  for (let i = 0; i < 3; i++) {
    // 每次都是新的資料：記住上一次的結果再回傳，量不出真正的速度
    const { orders, customers } = makeData(5_000, 50_000)
    const want = expected(orders, customers)
    const t = performance.now()
    const got = buildReport(orders, customers)
    times.push(performance.now() - t)
    assert.deepEqual(got, want, '大量資料時的輸出和原本不同')
    if (times[0] > 1500) break   // 太慢就不用再量了
  }
  const median = times.toSorted((a, b) => a - b)[Math.floor(times.length / 2)]
  assert.ok(median < 200,
    `花了 ${Math.round(median)}ms（要小於 200ms）。迴圈裡的 filter／find／some／includes 每次都要掃過整個陣列（map 還會每次建一個新陣列），客人數 × 訂單數就是幾億次比較。` +
    '先掃一次訂單，用 Map 依 customerId 分組或累加，之後每次查詢都是 O(1)。改完一個地方再量一次：可能還有第二個熱點')
})
