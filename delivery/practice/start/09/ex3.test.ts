// 練習 3：scripts/verify-points.sql 核對查詢、npm run undo-repair -- --run-id <名稱> 撤回一次修復
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const dir = import.meta.dirname
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')))
type Row = { id: number, customer_id: number, order_id: number | null, points: number, reason: string, run_id: string | null }

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
const entries = async () => (await db.query('SELECT id, customer_id, order_id, points, reason, run_id FROM point_entries ORDER BY id')).rows as Row[]
const totals = async () => (await db.query('SELECT count(*)::int AS count, coalesce(sum(points), 0)::int AS sum FROM point_entries')).rows[0]

// 應該扣回的重複紀錄（依 id 排序）
function toReverse(rows: Row[]) {
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
  return dups.filter(d => balance.get(d.customer_id)! - dupPoints.get(d.customer_id)! >= 0)
}
const orders = (list: Row[]) => new Set(list.map(d => d.order_id)).size

// 練習 2 的 --apply 做的事，這裡直接用 SQL 模擬（這一題不依賴你的練習 2）
async function simulateRun(runId: string, list: Row[]) {
  await db.query(`INSERT INTO data_repair_runs (run_id, kind, status, last_id, reversed) VALUES ($1, 'points-dedupe', 'done', $2, $3)
    ON CONFLICT (run_id) DO UPDATE SET last_id = $2, reversed = data_repair_runs.reversed + $3`, [runId, list.at(-1)!.id, list.length])
  await db.query(`INSERT INTO point_entries (customer_id, order_id, points, reason, reversal_of, run_id)
    SELECT customer_id, order_id, -points, 'dup_reversal', id, $2 FROM point_entries WHERE id = ANY($1::int[])`, [list.map(d => d.id), runId])
}

async function verify(): Promise<unknown[]> {
  const result = await db.query(readFileSync(join(dir, 'scripts/verify-points.sql'), 'utf8')) as pg.QueryResult | pg.QueryResult[]
  expect(Array.isArray(result), 'verify-points.sql 只能有一個 SQL 敘述（一個 SELECT，可以用 WITH 和 UNION ALL）').toBe(false)
  return (result as pg.QueryResult).rows
}

async function undo(...args: string[]) {
  return promisify(execFile)('node', ['scripts/undo-repair.ts', ...args], { cwd: dir, env, timeout: 60_000 })
    .then(o => ({ ok: true, out: o.stdout + o.stderr }), (e: { stdout?: string, stderr?: string, message: string }) => ({ ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` || e.message }))
}

let list: Row[]
let snapshot: { count: number, sum: number }
beforeAll(async () => {
  await db.connect()
  await loadSnapshot()
  await changeData()
  list = toReverse(await entries())
  snapshot = await totals()
})
afterAll(async () => {
  await db.end()
})

describe('練習 3：核對與撤回', () => {
  it('修復前：verify-points.sql 每一張需要扣回的訂單回傳一列', async () => {
    expect((await verify()).length, `修復前要找出 ${orders(list)} 張需要扣回的訂單（一張訂單一列，同一張有 2 筆重複也只算一列；不扣回的顧客不算）`).toBe(orders(list))
  })

  it('扣回一半：只回傳還沒扣回的訂單', async () => {
    const half = Math.floor(list.length / 2)
    await simulateRun('v-a', list.slice(0, half))
    expect((await verify()).length, '已經有補償紀錄（reversal_of 指向它）的重複不算問題').toBe(orders(list.slice(half)))
    await simulateRun('v-a', list.slice(half))
  })

  it('修復完成：回傳 0 列（不扣回的顧客不算問題）', async () => {
    expect(await verify(), '全部扣回之後要回傳 0 列；skipCustomers 的重複是店長決定先不扣的，不算問題').toEqual([])
  })

  it('undo 一個不存在的 run-id：失敗（exit code 不是 0），不改任何東西', async () => {
    const before = await totals()
    const r = await undo('--run-id', 'no-such-run')
    expect(r.ok, '找不到這個 run 要失敗並說明，打錯名稱時才不會以為撤回成功了').toBe(false)
    expect(await totals()).toEqual(before)
  })

  it('npm run undo-repair -- --run-id v-a：只撤回這一次，別次執行的紀錄保留', async () => {
    // 修完之後又出現一筆重複，由另一次執行 v-b 扣回
    const { rows: [o] } = await db.query(`SELECT customer_id, order_id, points FROM point_entries WHERE reason = 'order_paid' AND customer_id = (
      SELECT customer_id FROM point_entries GROUP BY customer_id ORDER BY sum(points) DESC, customer_id LIMIT 1) ORDER BY id LIMIT 1`)
    const { rows: [extra] } = await db.query(`INSERT INTO point_entries (customer_id, order_id, points, reason) VALUES ($1, $2, $3, 'order_paid') RETURNING id, customer_id, order_id, points, reason, NULL AS run_id`, [o.customer_id, o.order_id, o.points])
    await simulateRun('v-b', [extra])
    const r = await undo('--run-id', 'v-a')
    expect(r.ok, `npm run undo-repair -- --run-id v-a 執行失敗：\n${r.out.slice(-1500)}`).toBe(true)
    const now = await entries()
    expect(now.filter(e => e.run_id === 'v-a'), 'v-a 寫入的補償紀錄要全部移除').toEqual([])
    expect(now.filter(e => e.run_id === 'v-b').length, '只撤回指定的 run：v-b 的補償紀錄要留著（不能刪掉所有 dup_reversal）').toBe(1)
    expect(await totals(), '撤回後要回到 v-a 執行前：快照的筆數與總和，加上之後的那筆重複和它的補償紀錄').toEqual({ count: snapshot.count + 2, sum: snapshot.sum })
    const { rows: [run] } = await db.query(`SELECT status FROM data_repair_runs WHERE run_id = 'v-a'`)
    expect(run?.status, 'data_repair_runs 裡 v-a 的 status 要改成 undone').toBe('undone')
    expect((await verify()).length, '撤回之後，核對查詢又會找出那些訂單').toBe(orders(list))
  })
})
