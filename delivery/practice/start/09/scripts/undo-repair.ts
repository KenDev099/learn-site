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
  // 練習 3：TODO
  throw new Error('還沒實作 undo')
} catch (e) {
  console.error((e as Error).message)   // 只印原因，不印 stack
  process.exitCode = 1
} finally {
  await db.end()
}
