// 每個測試檔一個全新的 PostgreSQL 資料庫（第 20、22、24、26 課）
// 資料庫由 compose.yaml 的 learn-node-postgres 容器提供；名稱隨機，測試檔結束時刪掉，所以每次執行、每一題、平行執行都互不影響
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { after } from 'node:test'
import pg from 'pg'

export const ADMIN_URL = 'postgres://learn:learn@127.0.0.1:54329/coffee'
export const COFFEE_SQL = new URL('coffee.sql', import.meta.url).pathname

const HOW_TO_START = '需要 PostgreSQL：先打開 Docker Desktop，等它啟動完成，再到 learn/node/practice 執行 docker compose up -d --wait'

// sqlFiles：依序執行的 .sql 檔（絕對路徑），通常是 [COFFEE_SQL, join(import.meta.dirname, 'schema.sql')]
// 回傳 url（給學習者的程式用，例如 process.env.DATABASE_URL = url 之後再 import）、pool（測試自己查資料用）
export async function createTestDb(sqlFiles: string[] = [COFFEE_SQL]) {
  const admin = new pg.Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 2_000 })
  try {
    await admin.connect()
  } catch (e) {
    throw new Error(`${HOW_TO_START}（連線錯誤：${(e as Error).message || (e as { code?: string }).code}）`)
  }
  const name = `learn_node_${randomBytes(6).toString('hex')}`
  try {
    await admin.query(`CREATE DATABASE ${name}`)
  } finally {
    await admin.end()
  }
  const url = ADMIN_URL.replace(/\/coffee$/, `/${name}`)
  const pool = new pg.Pool({ connectionString: url, max: 5 })
  after(async () => {
    await pool.end()
    const c = new pg.Client(ADMIN_URL)
    await c.connect()
    await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)   // FORCE：學習者的程式沒關的連線也一起斷掉
    await c.end()
  })
  for (const f of sqlFiles) await pool.query(await readFile(f, 'utf8'))
  return { url, pool, name }
}
