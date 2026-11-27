// 練習 2：npm run repair-points -- --apply：分批寫補償紀錄、可續跑、重跑不重複、不扣成負數、不刪原始紀錄
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const dir = import.meta.dirname
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')))
type Row = { id: number, customer_id: number, order_id: number | null, points: number, reason: string, reversal_of: number | null, run_id: string | null }

async function loadSnapshot() {
  await db.query('TRUNCATE point_entries, data_repair_runs, processed_events, payments, order_items, orders RESTART IDENTITY CASCADE')
  await db.query('DELETE FROM customers WHERE id > 6')
  await db.query(readFileSync(join(dir, 'data/prod-snapshot.sql'), 'utf8'))
}
// 讓判分資料跟快照不一樣（擋下把試跑看到的名單、數字寫死）：多一份三筆的重複、一筆像重複的 manual、一位把點數兌換光的顧客
async function changeData() {
  const { rows: [o] } = await db.query(`SELECT order_id, customer_id, points FROM point_entries WHERE reason = 'order_paid' AND order_id IN (
    SELECT order_id FROM point_entries WHERE reason = 'order_paid' GROUP BY order_id HAVING count(*) = 1) ORDER BY order_id DESC LIMIT 1`)
  await db.query(`INSERT INTO point_entries (customer_id, order_id, points, reason) VALUES ($1, $2, $3, 'order_paid'), ($1, $2, $3, 'order_paid'), ($1, $2, $3, 'manual')`, [o.customer_id, o.order_id, o.points])
  const { rows: [c] } = await db.query(`SELECT customer_id, sum(points)::int AS balance FROM point_entries WHERE customer_id <> $1 GROUP BY customer_id ORDER BY customer_id DESC LIMIT 1`, [o.customer_id])
  await db.query(`INSERT INTO point_entries (customer_id, order_id, points, reason) SELECT customer_id, order_id, points, 'order_paid' FROM point_entries WHERE customer_id = $1 AND reason = 'order_paid' ORDER BY id LIMIT 1`, [c.customer_id])
  await db.query(`INSERT INTO point_entries (customer_id, points, reason) VALUES ($1, $2, 'redeem')`, [c.customer_id, -(c.balance + 1)])
}
const entries = async () => (await db.query('SELECT id, customer_id, order_id, points, reason, reversal_of, run_id FROM point_entries ORDER BY id')).rows as Row[]
const runRow = async (runId: string) => (await db.query('SELECT status, last_id, reversed FROM data_repair_runs WHERE run_id = $1', [runId])).rows[0]

// 照 CAFE-33 算出應該扣回哪幾筆（依 id 排序）
function expected(rows: Row[]) {
  const seen = new Map<number, number>(), balance = new Map<number, number>(), dupPoints = new Map<number, number>()
  const dups: Row[] = []
  for (const r of rows) {
    balance.set(r.customer_id, (balance.get(r.customer_id) ?? 0) + r.points)
    if (r.reason !== 'order_paid') continue
    const n = (seen.get(r.order_id!) ?? 0) + 1
    seen.set(r.order_id!, n)
    if (n > 1) {
      dups.push(r)
      dupPoints.set(r.customer_id, (dupPoints.get(r.customer_id) ?? 0) + r.points)
    }
  }
  const skip = new Set([...dupPoints].filter(([c, p]) => balance.get(c)! - p < 0).map(([c]) => c))
  return { skip, toReverse: dups.filter(d => !skip.has(d.customer_id)) }
}

async function apply(...args: string[]) {
  const r = await promisify(execFile)('node', ['scripts/repair-points.ts', '--apply', ...args], { cwd: dir, env, timeout: 60_000 })
    .then(o => ({ ok: true, out: o.stdout + o.stderr }), (e: { stdout?: string, stderr?: string, message: string }) => ({ ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` || e.message }))
  expect(r.ok, `npm run repair-points -- --apply ${args.join(' ')} 執行失敗：\n${r.out.slice(-1500)}`).toBe(true)
}

let original: Row[]
let want: ReturnType<typeof expected>
beforeAll(async () => {
  await db.connect()
  await loadSnapshot()
  await changeData()
  original = await entries()
  want = expected(original)
})
afterAll(async () => {
  await db.end()
})

describe('練習 2：--apply', () => {
  it('--batch-size 50 --max-batches 2：只做兩批（100 筆，依 id 由小到大）就停，進度記在 data_repair_runs', async () => {
    await apply('--run-id', 't-a', '--batch-size', '50', '--max-batches', '2')
    const reversals = (await entries()).filter(r => r.reason === 'dup_reversal')
    expect(reversals.length, '兩批、每批 50 筆，應該剛好寫了 100 筆補償紀錄').toBe(100)
    expect(reversals.map(r => r.reversal_of).sort((a, b) => a! - b!), '要依原始紀錄的 id 由小到大一批一批做（不扣回的顧客跳過）').toEqual(want.toReverse.slice(0, 100).map(d => d.id))
    const run = await runRow('t-a')
    expect(run, 'data_repair_runs 要有一列 run_id = t-a').toBeTruthy()
    expect(run.status, '還沒做完，status 要是 running').toBe('running')
    expect(run.last_id, 'last_id（游標）要記到第 100 筆原始紀錄的 id：續跑時從這裡接著做').toBe(want.toReverse[99].id)
  })

  it('用同一個 run-id 再執行：接著做完，結果跟一次跑完相同', async () => {
    await apply('--run-id', 't-a', '--batch-size', '50')
    const now = await entries()
    const byId = new Map(now.map(r => [r.id, r]))
    for (const o of original) expect(byId.get(o.id), `原始紀錄 #${o.id} 不見了或被改了：修正帳務資料要新增補償紀錄，不能刪除、修改原本的紀錄`).toEqual(o)
    const reversals = now.filter(r => r.reason === 'dup_reversal')
    expect(reversals.length, `應該剛好有 ${want.toReverse.length} 筆補償紀錄（每一筆要扣回的重複各一筆）`).toBe(want.toReverse.length)
    expect(now.length, '除了補償紀錄，不能新增別的紀錄').toBe(original.length + want.toReverse.length)
    const of = new Map(reversals.map(r => [r.reversal_of, r]))
    for (const d of want.toReverse) {
      const r = of.get(d.id)
      expect(r, `重複的紀錄 #${d.id} 沒有被扣回`).toBeTruthy()
      expect({ customer: r!.customer_id, order: r!.order_id, points: r!.points, run: r!.run_id }, `#${d.id} 的補償紀錄：同一位顧客、同一張訂單、points 是原本的負數、run_id 是這次執行的名稱`)
        .toEqual({ customer: d.customer_id, order: d.order_id, points: -d.points, run: 't-a' })
    }
    const skipped = reversals.filter(r => want.skip.has(r.customer_id))
    expect(skipped.map(r => r.customer_id), '扣回後點數會變負的顧客（skipCustomers）這次不扣回，留給店長聯繫').toEqual([])
    const { rows: negative } = await db.query('SELECT customer_id FROM point_entries GROUP BY customer_id HAVING sum(points) < 0')
    expect(negative, '修復後不能有顧客的點數是負的').toEqual([])
    const run = await runRow('t-a')
    expect(run.status, '做完之後 data_repair_runs 的 status 要是 done').toBe('done')
    expect(run.reversed, 'data_repair_runs.reversed 要是這次執行寫入的補償紀錄筆數').toBe(want.toReverse.length)
  })

  it('再執行一次、或換一個 run-id 執行：不新增任何紀錄', async () => {
    const count = (await entries()).length
    await apply('--run-id', 't-a')
    expect((await entries()).length, '已經完成的 run 再執行一次，不能再寫入補償紀錄').toBe(count)
    await apply('--run-id', 't-b', '--batch-size', '50')
    expect((await entries()).length, '換一個 run-id 執行，已經扣回的也不能再扣一次（只扣還沒有補償紀錄的重複）').toBe(count)
  })
})
