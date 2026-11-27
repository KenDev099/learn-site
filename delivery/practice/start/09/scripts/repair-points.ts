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

type Plan = {
  duplicates: number          // 重複的紀錄有幾筆（包含不扣回的顧客）
  affectedCustomers: number   // 有重複紀錄的顧客有幾位（包含不扣回的顧客）
  totalPoints: number         // 這次會扣回的點數合計（正數，不包含不扣回的顧客）
  skipCustomers: number[]     // 扣回後點數會小於 0、這次不扣回的顧客 id，由小到大
}

// 練習 1：算出計畫。只能讀，不能寫入任何東西
async function plan(db: pg.Client): Promise<Plan> {
  // TODO
  return { duplicates: 0, affectedCustomers: 0, totalPoints: 0, skipCustomers: [] }
}

// 練習 2：分批寫入補償紀錄（reason = 'dup_reversal'、points = 原本的負數、reversal_of = 原本那筆的 id、run_id）
// 每批一個交易；進度記在 data_repair_runs；skipCustomers 不扣回；重跑不能重複扣回
async function apply(db: pg.Client, runId: string, batchSize: number, maxBatches: number) {
  // TODO
  throw new Error('還沒實作 --apply')
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
