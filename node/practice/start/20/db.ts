// 練習 1：建立連線池、檢查資料庫是不是活著
import pg from 'pg'
import { DatabaseUnavailableError } from './errors.ts'

// TODO：max 5、connectionTimeoutMillis 1000、idleTimeoutMillis 10000、statement_timeout 2000，
// 並處理 pool 的 'error' 事件（用 console.error 記下來，不要讓程序崩潰）
export function createPool(url: string) {
  return new pg.Pool({ connectionString: url })
}

// TODO：失敗時丟 DatabaseUnavailableError（cause 放原本的錯誤）
export async function health(pool: pg.Pool) {
  await pool.query('SELECT 1')
}
