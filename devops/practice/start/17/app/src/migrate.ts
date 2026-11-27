// 部署前的一次性步驟：把 migrations/ 裡還沒套用的 migration 依序套用，跑完就結束（exit 0 成功、exit 1 失敗）
// 已套用的紀錄在 pgmigrations 表。node-pg-migrate 9.0.0 預設用 advisory lock 保證同時只有一個在套用；
// 預設模式 fail 會讓第二個直接失敗，這裡改成 wait：第二個等第一個做完，再發現沒有要做的事，正常結束
import { runner } from 'node-pg-migrate'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('缺少環境變數 DATABASE_URL')
  process.exit(1)
}

try {
  const done = await runner({ databaseUrl, dir: 'migrations', direction: 'up', migrationsTable: 'pgmigrations', advisoryLockMode: 'wait' })
  console.log(`migration 完成，這次套用了 ${done.length} 個`)
} catch (e) {
  console.error('migration 失敗：', (e as Error).message)
  process.exit(1)
}
