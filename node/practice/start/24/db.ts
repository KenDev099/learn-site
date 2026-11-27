// 交易的小工具（第 20 課寫過），不用改這個檔案
import type pg from 'pg'

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
