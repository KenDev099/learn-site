import test from 'node:test'
import assert from 'node:assert/strict'
import { loadOrders, type Order } from './orders.ts'
import { computeDailyReport } from './daily-report.ts'

const opts = { timeout: 30_000 }
type AsyncReport = (orders: Order[]) => Promise<unknown>

// 不量時間（機器忙的時候計時器本來就會晚），改成直接數：
// 一個 setImmediate 迴圈每走完一輪 event loop 就把 round 加 1；每筆訂單被讀的時候記下當時是第幾輪。
// 同一輪裡讀了幾筆 = 那一段一口氣處理了幾筆。
test('切成小段、每段之間讓出 event loop，結果和同步版完全一樣', opts, async () => {
  const mod: { computeDailyReportAsync?: unknown } = await import('./report-async.ts')
  assert.equal(typeof mod.computeDailyReportAsync, 'function', 'report-async.ts 要 export computeDailyReportAsync')
  const computeAsync = mod.computeDailyReportAsync as AsyncReport

  const day = 1 + Math.floor(Math.random() * 100_000)
  let count = 300_000 + Math.floor(Math.random() * 100_000)
  if (count % 1000 === 0) count += 7   // 不是整數段：最後一段不滿也要算到
  const expected = computeDailyReport(loadOrders(day, count))

  let round = 0
  let running = true
  const spin = () => { round++; if (running) setImmediate(spin) }
  setImmediate(spin)

  const perRound = new Map<number, number>()
  const orders = loadOrders(day, count)
  for (const order of orders) {
    const id = order.id
    Object.defineProperty(order, 'id', {
      enumerable: true,
      get() { perRound.set(round, (perRound.get(round) ?? 0) + 1); return id },
    })
  }

  let got: unknown
  try {
    const pending = computeAsync(orders)
    assert.ok(pending instanceof Promise, 'computeDailyReportAsync 要回傳 Promise')
    got = await pending
  } finally {
    running = false
  }

  assert.deepEqual(got, expected, '結果要和 computeDailyReport(orders) 完全一樣：用 daily-report.ts 的 createTally、addOrder、finishReport，每一筆都要加到，最後一段也不能漏')
  const chunks = [...perRound.values()]
  const biggest = Math.max(...chunks)
  assert.ok(biggest <= 20_000,
    `有一段一口氣處理了 ${biggest} 筆才讓出（上限 20000 筆）：這段時間計時器和其他請求都動不了。` +
    '加 async 不會讓計算變成背景執行；await Promise.resolve()、queueMicrotask、process.nextTick 也不算讓出（microtask 在 event loop 往下走之前就清空）。' +
    '把迴圈切成幾千筆一段，每段之間 await 一次 setImmediate')
  const average = count / chunks.length
  assert.ok(average >= 100,
    `平均每段只處理 ${Math.round(average)} 筆就讓出一次（至少要 100 筆）：讓出本身也有成本，每一筆都讓出會比同步版慢好幾十倍。一段處理幾千筆再讓出`)
})
