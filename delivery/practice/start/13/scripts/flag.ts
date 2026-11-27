// 查看或修改功能旗標（feature_flags 表）。改了之後 API 的下一個請求就照新的值，不用重新部署
//   npm run flag                           列出所有旗標
//   npm run flag -- payments.sdk_v2 10     開給 10%
//   npm run flag -- payments.sdk_v2 0      退回：全部走舊的路徑
//   npm run flag -- orders.search off      開關型的旗標：on＝100、off＝0
// 每次修改都在 ops/flag-changes.log 加一行（時間、旗標、改之前 → 改之後），事故的時間線從這裡查
// 連線用 DATABASE_URL（api/.env；已經設定的環境變數優先）
import { appendFileSync } from 'node:fs'
import pg from 'pg'

process.loadEnvFile(new URL('../api/.env', import.meta.url))

const [key, value] = process.argv.slice(2)
const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
await db.connect()
try {
  if (key !== undefined) {
    const percent = value === 'on' ? 100 : value === 'off' ? 0 : Number(value)
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new Error('用法：npm run flag -- <key> <0～100 的整數 | on | off>')
    const before = (await db.query('SELECT percent FROM feature_flags WHERE key = $1', [key])).rows[0]
    await db.query(`INSERT INTO feature_flags (key, percent, updated_at) VALUES ($1, $2, now())
      ON CONFLICT (key) DO UPDATE SET percent = EXCLUDED.percent, updated_at = now()`, [key, percent])
    const line = `${new Date().toISOString()} ${key} ${before?.percent ?? '（新的旗標）'} → ${percent}`
    appendFileSync(new URL('../ops/flag-changes.log', import.meta.url), line + '\n')
    console.log(`${key}：${before?.percent ?? '（新的旗標）'}% → ${percent}%（記在 ops/flag-changes.log）`)
  }
  const { rows } = await db.query(`SELECT key, percent, to_char(updated_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD HH24:MI') AS updated FROM feature_flags ORDER BY key`)
  console.table(rows)
} catch (e) {
  console.error((e as Error).message)
  process.exitCode = 1
} finally {
  await db.end()
}
