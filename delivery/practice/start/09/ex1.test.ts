// 練習 1：npm run repair-points -- --dry-run 算出計畫寫到 plan.json，不寫入資料庫
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const dir = import.meta.dirname
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')))
type Row = { id: number, customer_id: number, order_id: number | null, points: number, reason: string }

async function loadSnapshot() {
  await db.query('TRUNCATE point_entries, data_repair_runs, processed_events, payments, order_items, orders RESTART IDENTITY CASCADE')
  await db.query('DELETE FROM customers WHERE id > 6')
  await db.query(readFileSync(join(dir, 'data/prod-snapshot.sql'), 'utf8'))
}
const entries = async () => (await db.query('SELECT id, customer_id, order_id, points, reason FROM point_entries ORDER BY id')).rows as Row[]
// seq：point_entries 的 id 序號。INSERT 之後就算 ROLLBACK，序號也不會退回，所以「先寫再回滾」也看得出來
const totals = async () => (await db.query(`SELECT count(*)::int AS count, coalesce(sum(points), 0)::int AS sum,
  (SELECT count(*)::int FROM data_repair_runs) AS runs, (SELECT last_value::int FROM point_entries_id_seq) AS seq FROM point_entries`)).rows[0]

// 照 CAFE-33 自己算一次（測試用的對照答案）
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
  const skipCustomers = [...dupPoints].filter(([c, p]) => balance.get(c)! - p < 0).map(([c]) => c).sort((a, b) => a - b)
  const totalPoints = dups.filter(d => !skipCustomers.includes(d.customer_id)).reduce((s, d) => s + d.points, 0)
  return { duplicates: dups.length, affectedCustomers: dupPoints.size, totalPoints, skipCustomers }
}

async function dryRun() {
  rmSync(join(dir, 'plan.json'), { force: true })
  const r = await promisify(execFile)('npm', ['run', '--silent', 'repair-points', '--', '--dry-run'], { cwd: dir, env, timeout: 60_000 })
    .then(o => ({ ok: true, out: o.stdout + o.stderr }), (e: { stdout?: string, stderr?: string, message: string }) => ({ ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` || e.message }))
  expect(r.ok, `npm run repair-points -- --dry-run 執行失敗：\n${r.out.slice(-1500)}`).toBe(true)
  expect(existsSync(join(dir, 'plan.json')), '--dry-run 要把計畫寫到專案根目錄的 plan.json').toBe(true)
  return JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'))
}

function comparePlan(plan: Record<string, unknown>, want: ReturnType<typeof expected>) {
  expect(plan.duplicates, `duplicates（重複的紀錄筆數）不對：同一張訂單的 order_paid 依 id 排第二筆以後才算重複（3 筆算 2 筆）；reason = 'manual' 不算`).toBe(want.duplicates)
  expect(plan.affectedCustomers, 'affectedCustomers（有重複紀錄的顧客數，包含不扣回的）不對').toBe(want.affectedCustomers)
  expect(plan.skipCustomers, 'skipCustomers 不對：顧客「全部紀錄的點數加總 − 自己的重複點數」小於 0 的才不扣回，id 由小到大').toEqual(want.skipCustomers)
  expect(plan.totalPoints, 'totalPoints（這次會扣回的點數，正數，不含 skipCustomers 的）不對').toBe(want.totalPoints)
}

beforeAll(async () => {
  await db.connect()
  await loadSnapshot()
})
afterAll(async () => {
  await db.end()
})

describe('練習 1：dry-run', () => {
  let before: { count: number, sum: number, runs: number, seq: number }

  it('npm run repair-points -- --dry-run：plan.json 的四個數字正確', async () => {
    before = await totals()
    comparePlan(await dryRun(), expected(await entries()))
  })

  it('dry-run 不寫入任何東西：point_entries 的筆數、總和、id 序號與 data_repair_runs 都沒變', async () => {
    expect(await totals(), 'dry-run 只能讀：不能寫補償紀錄、不能建立執行紀錄，也不能「先寫進去再 ROLLBACK」來算數字（point_entries 的 id 序號被用掉了）').toEqual(before)
  })

  it('資料不一樣時，數字跟著變（不能寫死）', async () => {
    // 多一份三筆的重複、一筆看起來像重複的 manual、一位顧客把點數兌換光
    const { rows: [o] } = await db.query(`SELECT order_id, customer_id, points FROM point_entries WHERE reason = 'order_paid' AND order_id IN (
      SELECT order_id FROM point_entries WHERE reason = 'order_paid' GROUP BY order_id HAVING count(*) = 1) ORDER BY order_id LIMIT 1`)
    await db.query(`INSERT INTO point_entries (customer_id, order_id, points, reason) VALUES ($1, $2, $3, 'order_paid'), ($1, $2, $3, 'order_paid'), ($1, $2, $3, 'manual')`, [o.customer_id, o.order_id, o.points])
    const { rows: [c] } = await db.query(`SELECT customer_id, sum(points)::int AS balance FROM point_entries WHERE customer_id <> $1 GROUP BY customer_id ORDER BY customer_id DESC LIMIT 1`, [o.customer_id])
    await db.query(`INSERT INTO point_entries (customer_id, order_id, points, reason) SELECT customer_id, order_id, points, 'order_paid' FROM point_entries WHERE customer_id = $1 AND reason = 'order_paid' ORDER BY id LIMIT 1`, [c.customer_id])
    await db.query(`INSERT INTO point_entries (customer_id, points, reason) VALUES ($1, $2, 'redeem')`, [c.customer_id, -(c.balance + 1)])
    comparePlan(await dryRun(), expected(await entries()))
  })
})
