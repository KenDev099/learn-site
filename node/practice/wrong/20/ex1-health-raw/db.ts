// 練習 1：建立連線池、檢查資料庫是不是活著
import pg from 'pg'
import { DatabaseUnavailableError } from './errors.ts'

export function createPool(url: string) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,                          // 這個程序最多 5 條連線；程序數 × max 不能超過資料庫的 max_connections
    connectionTimeoutMillis: 1000,   // 借不到連線、連不上時 1 秒就失敗（預設 0 = 永遠等）
    idleTimeoutMillis: 10000,        // 閒置 10 秒的連線關掉
    statement_timeout: 2000,         // 每一句 SQL 最多跑 2 秒，超過由資料庫取消（57014）
  })
  // 閒置的連線被資料庫或網路切斷時，錯誤從這裡出來；沒有 listener 程序會崩潰
  pool.on('error', (err) => {
    console.error('閒置的資料庫連線出錯', err)
  })
  return pool
}

export async function health(pool: pg.Pool) {
  await pool.query("SELECT 1")
}
