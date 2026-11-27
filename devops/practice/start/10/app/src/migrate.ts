// 把 migrations/ 裡還沒套用的 migration 依序套用，跑完就結束（exit 0 成功、exit 1 失敗）
// 已套用的紀錄在 pgmigrations 表；同時有兩個在跑時，node-pg-migrate 用 advisory lock 讓第二個等待或失敗
import { runner } from 'node-pg-migrate'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('缺少環境變數 DATABASE_URL')
  process.exit(1)
}

try {
  const done = await runner({ databaseUrl, dir: 'migrations', direction: 'up', migrationsTable: 'pgmigrations' })
  console.log(`migration 完成，這次套用了 ${done.length} 個`)
} catch (e) {
  console.error('migration 失敗：', (e as Error).message)
  process.exit(1)
}
