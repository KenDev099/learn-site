// 部署前的一次性步驟（第 17 課）：套用 migrations/ 裡還沒套用的 migration，跑完就結束（exit 0 成功、exit 1 失敗）
// 要用有建表權限的帳號（cafe_migrator）執行；api 用的 cafe_app 只能讀寫資料
import { runner } from 'node-pg-migrate'
import { dbConfig } from './config.js'

try {
  const done = await runner({ databaseUrl: dbConfig(), dir: 'migrations', direction: 'up', migrationsTable: 'pgmigrations', advisoryLockMode: 'wait' })
  console.log(`migration 完成，這次套用了 ${done.length} 個`)
} catch (e) {
  console.error('migration 失敗：', (e as Error).message)
  process.exit(1)
}
