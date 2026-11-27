// CAFE-33：修正重複發放的點數
//   npm run repair-points -- --dry-run                    試跑：算出計畫，寫到 plan.json，不寫資料庫
//   npm run repair-points -- --apply --run-id cafe33-1    套用：分批寫入補償紀錄；中斷後用同一個 run-id 再執行，從斷點接著做
//   選項：--batch-size 200（每批幾筆）、--max-batches 2（跑幾批就停：分段執行、演練中斷）
// 連線用 DATABASE_URL（api/.env；已經設定的環境變數優先）
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import pg from 'pg'

process.loadEnvFile(new URL('../api/.env', import.meta.url))

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    apply: { type: 'boolean', default: false },
    'run-id': { type: 'string' },
    'batch-size': { type: 'string', default: '200' },
    'max-batches': { type: 'string' },
  },
})

// 還沒扣回的重複紀錄：同一張訂單的 order_paid，依 id 排第二筆以後的。manual 不算（CAFE-33 第 2 點）
// 已經有補償紀錄指向它的（reversal_of）不再算，所以修復做到一半時，這裡只剩還沒處理的
const DUPLICATES = `
  SELECT id, customer_id, order_id, points FROM (
    SELECT id, customer_id, order_id, points,
           row_number() OVER (PARTITION BY order_id ORDER BY id) AS n
    FROM point_entries
    WHERE reason = 'order_paid'
  ) t
  WHERE n > 1
    AND NOT EXISTS (SELECT 1 FROM point_entries r WHERE r.reversal_of = t.id)`

// 不扣回的顧客：目前的點數 − 還沒扣回的重複點數 < 0（CAFE-33 第 3 點）
const SKIP = `
  SELECT d.customer_id
  FROM (${DUPLICATES}) d
  JOIN (SELECT customer_id, sum(points) AS balance FROM point_entries GROUP BY customer_id) b USING (customer_id)
  GROUP BY d.customer_id, b.balance
  HAVING b.balance - sum(d.points) < 0
  ORDER BY d.customer_id`

type Plan = {
  duplicates: number          // 重複的紀錄有幾筆（包含不扣回的顧客）
  affectedCustomers: number   // 有重複紀錄的顧客有幾位（包含不扣回的顧客）
  totalPoints: number         // 這次會扣回的點數合計（正數，不包含不扣回的顧客）
  skipCustomers: number[]     // 扣回後點數會小於 0、這次不扣回的顧客 id，由小到大
}

// 練習 1：算出計畫。只能讀，不能寫入任何東西
async function plan(db: pg.Client): Promise<Plan> {
  const dups = (await db.query(DUPLICATES)).rows as { id: number, customer_id: number, points: number }[]
  const skipCustomers = (await db.query(SKIP)).rows.map(r => r.customer_id as number)
  const reversed = dups.filter(d => !skipCustomers.includes(d.customer_id))
  return {
    duplicates: dups.length,
    affectedCustomers: new Set(dups.map(d => d.customer_id)).size,
    totalPoints: reversed.reduce((sum, d) => sum + d.points, 0),
    skipCustomers,
  }
}

// 練習 2：分批寫入補償紀錄（reason = 'dup_reversal'、points = 原本的負數、reversal_of = 原本那筆的 id、run_id）
// 每批一個交易；進度記在 data_repair_runs；skipCustomers 不扣回；重跑不能重複扣回
async function apply(db: pg.Client, runId: string, batchSize: number, maxBatches: number) {
  // 第一次執行建立執行紀錄；同一個 run-id 再執行就沿用（從 last_id 接著做）
  await db.query(`INSERT INTO data_repair_runs (run_id, kind, status) VALUES ($1, 'points-dedupe', 'running')
    ON CONFLICT (run_id) DO NOTHING`, [runId])
  const run = (await db.query('SELECT * FROM data_repair_runs WHERE run_id = $1', [runId])).rows[0]
  if (run.kind !== 'points-dedupe') throw new Error(`${runId} 是別種修復（${run.kind}），換一個 run-id`)
  if (run.status === 'undone') throw new Error(`${runId} 已經撤回，要重做請換一個 run-id`)
  if (run.status === 'done') return console.log(`${runId} 已經完成，不用再執行`)

  // 開始前算一次；續跑時重算結果相同（已扣回的點數和已扣回的重複一起從兩邊消失）
  const skip = (await db.query(SKIP)).rows.map(r => r.customer_id as number)
  let lastId: number = run.last_id
  for (let batch = 0; batch < maxBatches; batch++) {
    await db.query('BEGIN')
    try {
      // 依 id 往後拿一批（keyset：id > 游標），不用 OFFSET
      const { rows } = await db.query(`SELECT id FROM (${DUPLICATES}) d
        WHERE id > $1 AND NOT (customer_id = ANY($2::int[])) ORDER BY id LIMIT $3`, [lastId, skip, batchSize])
      if (rows.length === 0) {
        await db.query(`UPDATE data_repair_runs SET status = 'done', finished_at = now() WHERE run_id = $1`, [runId])
        await db.query('COMMIT')
        console.log(`${runId} 完成`)
        return
      }
      // reversal_of 是 UNIQUE：同一筆就算被別次執行處理過，也只會有一筆補償紀錄
      const inserted = await db.query(`DELETE FROM point_entries WHERE id = ANY($1::int[])`, [rows.map(r => r.id)])
      lastId = rows.at(-1).id
      await db.query('UPDATE data_repair_runs SET last_id = $2, reversed = reversed + $3 WHERE run_id = $1', [runId, lastId, inserted.rowCount])
      await db.query('COMMIT')   // 這一批和它的進度一起提交：中斷時，已提交的批次與游標一致
      console.log(`第 ${batch + 1} 批：扣回 ${inserted.rowCount} 筆，游標 ${lastId}`)
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }
  }
  console.log(`跑完 ${maxBatches} 批先停在游標 ${lastId}；用同一個 --run-id 再執行會接著做`)
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
try {
  if (args['dry-run']) {
    const result = await plan(db)
    writeFileSync(new URL('../plan.json', import.meta.url), JSON.stringify(result, null, 2) + '\n')
    console.log(result)
  } else if (args.apply) {
    if (!args['run-id']) throw new Error('--apply 要加 --run-id <名稱>，例如 --run-id cafe33-1')
    await apply(db, args['run-id'], Number(args['batch-size']), Number(args['max-batches'] ?? Infinity))
  } else {
    throw new Error('要指定 --dry-run 或 --apply')
  }
} catch (e) {
  console.error((e as Error).message)   // 只印原因，不印 stack
  process.exitCode = 1
} finally {
  await db.end()
}
