// 練習 3：用 answers.json 的 databaseUrl 連線一次，印出結果。在 work/12 執行：node check-db.mjs
import { readFileSync } from 'node:fs'
import pg from 'pg'

const { databaseUrl } = JSON.parse(readFileSync(new URL('./answers.json', import.meta.url), 'utf8'))
const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 })
try {
  await client.connect()
  const { rows } = await client.query('SELECT current_user, current_database()')
  console.log('connected', rows[0])
} catch (e) {
  console.log(e.code ?? '(沒有錯誤代碼)', e.message)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
