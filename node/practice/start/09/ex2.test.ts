import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { after } from 'node:test'
import { listen } from '../../helpers/http.ts'
import { runNode } from '../../helpers/proc.ts'
import { tmpProject } from '../../helpers/tmp.ts'
import { loadOrders } from './orders.ts'
import { computeDailyReport } from './daily-report.ts'

const opts = { timeout: 30_000 }
type Pool = { run(job: { day: number, count: number }): Promise<unknown>, close(): Promise<void> }

// 記下學習者建立的每個 worker：測試結束時就算 close() 沒寫好，也讓它們不再撐住這個測試程序
// 也記下它們的 threadId：報表上的 threadId 一定要是真的 worker 的編號
const live = new Set<Worker>()
const workerIds = new Set<number>()
const proto = Worker.prototype as unknown as Record<string, (...args: unknown[]) => unknown>
for (const name of ['on', 'once', 'addListener', 'prependListener']) {
  const original = proto[name]
  proto[name] = function (this: Worker, ...args: unknown[]) {
    live.add(this)
    workerIds.add(this.threadId)
    return original.apply(this, args)
  }
}
after(() => { for (const w of live) w.unref() })

async function setup() {
  const mod: { createReportPool?: unknown } = await import('./report-pool.ts')
  assert.equal(typeof mod.createReportPool, 'function', 'report-pool.ts 要 export createReportPool')
  const pool = (mod.createReportPool as (o: { size: number }) => Pool)({ size: 2 })
  after(() => pool.close())
  const { createApp } = await import('./server.ts')
  const { url } = await listen(createApp(pool as never))
  // 每個請求最多等 10 秒，卡住時給清楚的訊息
  const get = async (path: string) => {
    try {
      const res = await fetch(url + path, { signal: AbortSignal.timeout(10_000) })
      return { status: res.status, body: await res.json() as Record<string, unknown> }
    } catch (err) {
      throw new Error(`GET ${path} 10 秒內沒有回應：工作是不是卡在某個 worker 上（例如那個 worker 已經結束、或沒有排隊機制）？`, { cause: err })
    }
  }
  // 暖身：兩個 worker 各跑一次小報表
  await Promise.all([get('/reports/daily?day=1&count=1000'), get('/reports/daily?day=2&count=1000')])
  return { get, pool }
}

const randomDay = () => 1 + Math.floor(Math.random() * 100_000)
const expected = (day: number, count: number) => computeDailyReport(loadOrders(day, count))
function check(r: { status: number, body: Record<string, unknown> }, day: number, count: number) {
  assert.equal(r.status, 200, `day=${day} 的報表失敗了：${JSON.stringify(r.body)}。全部 worker 都在忙時要排隊，不能丟錯`)
  const { threadId, ...report } = r.body
  assert.deepEqual(report, expected(day, count), `day=${day} 的報表內容不對：每個工作要用 id 對應到 worker 回傳的那一份`)
  assert.ok(typeof threadId === 'number' && threadId !== 0 && workerIds.has(threadId), `報表上的 threadId 是 ${threadId}，不是任何一個 worker 的編號：報表要交給 report-worker.ts 在 worker 裡算，主執行緒不要自己算`)
  return threadId
}

test('同時 6 份報表：/health 不用等、結果正確、只用 2 個重複使用的 worker', opts, async () => {
  const { get } = await setup()
  const days = Array.from({ length: 6 }, randomDay)
  let done = 0
  const reports = days.map(day => get(`/reports/daily?day=${day}&count=200000`).finally(() => { done++ }))
  const health = await get('/health')
  const doneBeforeHealth = done
  const results = await Promise.all(reports)

  assert.deepEqual(health.body, { ok: true })
  assert.ok(doneBeforeHealth < 6, '6 份報表全部算完，/health 才回應：主執行緒被計算卡住了。計算要交給 worker，主執行緒只負責收請求和回應')
  const ids = new Set(results.map((r, i) => check(r, days[i], 200_000)))
  assert.equal(ids.size, 2, `6 份報表用了 ${ids.size} 條不同的執行緒，應該剛好是 size 的 2 條：一開始建立 2 個 worker 並重複使用，不要每個工作 new 一個`)
})

test('用 id 對應結果；計算丟錯只讓那個請求失敗；worker 當掉後會補一個，之後照常用 2 個 worker', opts, async () => {
  const { get, pool } = await setup()
  // 先送的大工作比後送的小工作晚算完：回傳的訊息要用 id 對回各自的工作，不能「先送先收」
  const bigDay = randomDay(), smallDay = randomDay()
  const [big, small] = await Promise.all([pool.run({ day: bigDay, count: 200_000 }), pool.run({ day: smallDay, count: 10 })]) as Record<string, unknown>[]
  for (const [r, d, c] of [[big, bigDay, 200_000], [small, smallDay, 10]] as const) {
    const { threadId: _, ...report } = r
    assert.deepEqual(report, expected(d, c), `先送 ${bigDay} 天 20 萬筆、再送 ${smallDay} 天 10 筆，小的先算完。第 ${d} 天拿到的報表不是它自己的：worker 回傳 { id, report } 時，要用 id（或「這個 worker 手上是哪個工作」）找到對應的工作`)
  }

  const day = randomDay()
  const [bad, ok] = await Promise.all([get('/reports/daily?day=-1&count=1000'), get(`/reports/daily?day=${day}&count=1000`)])
  assert.equal(bad.status, 500, '讀取訂單丟錯時那個工作要 reject（server 回 500）')
  assert.match(String(bad.body.error), /資料庫連線中斷/, 'reject 的錯誤訊息要用 worker 回傳的 error')
  check(ok, day, 1000)

  const crash = await get('/reports/daily?day=-2&count=1000')
  assert.equal(crash.status, 500, 'worker 直接結束（process.exit(1)）時，它手上的工作要 reject：聽 worker 的 exit 事件')

  const days = Array.from({ length: 4 }, randomDay)
  const results = await Promise.all(days.map(d => get(`/reports/daily?day=${d}&count=50000`)))
  const ids = new Set(results.map((r, i) => check(r, days[i], 50_000)))
  assert.equal(ids.size, 2, ids.size > 2
    ? `worker 當掉之後，4 份報表用了 ${ids.size} 條執行緒：pool 要維持剛好 2 個重複使用的 worker，不要每個工作 new 一個`
    : `worker 當掉之後，4 份報表只用了 ${ids.size} 條執行緒：結束的 worker 要補一個新的，pool 才會維持 2 個`)
})

test('close() 終止所有 worker，程式能自己結束', opts, async () => {
  const pool = pathToFileURL(join(import.meta.dirname, 'report-pool.ts')).href
  const dir = await tmpProject({
    'main.ts': `import { createReportPool } from '${pool}'
const pool = createReportPool({ size: 2 })
const report = await pool.run({ day: 7, count: 1000 })
console.log(report.orders)
await pool.close()
`,
  })
  let r
  try {
    r = await runNode(join(dir, 'main.ts'), { timeoutMs: 10_000 })
  } catch {
    assert.fail('run 一次再 close() 之後，程式 10 秒內沒有結束：close() 要對每個 worker 呼叫 terminate() 並等它們結束（還活著的 worker 會撐住程序）')
  }
  assert.equal(r.code, 0, `程式出錯了：${r.stderr.slice(0, 500)}`)
  assert.equal(r.stdout, '1000\n')
})
