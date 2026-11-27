// 撤回一次資料修復：npm run undo-repair -- --run-id cafe33-1
// 只移除這一次執行寫入的補償紀錄，別次執行的不動；執行紀錄（data_repair_runs）標成 undone
import { parseArgs } from 'node:util'
import pg from 'pg'

process.loadEnvFile(new URL('../api/.env', import.meta.url))

const { values: args } = parseArgs({ options: { 'run-id': { type: 'string' } } })
if (!args['run-id']) {
  console.error('要加 --run-id <名稱>')
  process.exit(1)
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
try {
  await db.query('BEGIN')
  // 撤回前要先確定這個 run 已經停了（不是還在另一個終端機跑）
  const run = (await db.query('SELECT status FROM data_repair_runs WHERE run_id = $1', [args['run-id']])).rows[0]
  if (!run) {
    throw new Error(`找不到 run ${args['run-id']}：先查 SELECT run_id, status FROM data_repair_runs`)
  }
  // 只刪這次執行寫入的補償紀錄；原始紀錄、別次執行的紀錄都不動
  const removed = await db.query(`DELETE FROM point_entries WHERE run_id = $1 AND reason = 'dup_reversal'`, [args['run-id']])
  await db.query('COMMIT')
  console.log(`已撤回 ${args['run-id']}：移除 ${removed.rowCount} 筆補償紀錄`)
} catch (e) {
  console.error((e as Error).message)   // 只印原因，不印 stack
  process.exitCode = 1
} finally {
  await db.end()
}
