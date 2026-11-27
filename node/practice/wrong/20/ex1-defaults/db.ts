// 練習 1：建立連線池、檢查資料庫是不是活著
import pg from 'pg'
import { DatabaseUnavailableError } from './errors.ts'

export function createPool(url: string) {
  const pool = new pg.Pool({ connectionString: url })
  // 閒置的連線被資料庫或網路切斷時，錯誤從這裡出來；沒有 listener 程序會崩潰
  pool.on('error', (err) => {
    console.error('閒置的資料庫連線出錯', err)
  })
  return pool
}

export async function health(pool: pg.Pool) {
  try {
    await pool.query('SELECT 1')
  } catch (err) {
    throw new DatabaseUnavailableError('資料庫無法使用', { cause: err })
  }
}
