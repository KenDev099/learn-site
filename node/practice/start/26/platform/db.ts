// 連線池與交易（第 20 課）。這個檔不用改
import pg from 'pg'
import type { Logger } from './logger.ts'

export function createPool(url: string, logger: Logger) {
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,                         // 程序數 × max 不能超過資料庫的 max_connections（第 24 課）
    connectionTimeoutMillis: 1000,   // 借不到連線、連不上時 1 秒就失敗
    idleTimeoutMillis: 10_000,
    statement_timeout: 5000,         // 每句 SQL 最多 5 秒
  })
  pool.on('error', err => logger.error('閒置的資料庫連線出錯', { err }))
  return pool
}

export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()   // 整個交易都用這一條連線
  let broken: Error | undefined
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackErr) {
      broken = rollbackErr as Error
    }
    throw err
  } finally {
    client.release(broken)
  }
}
