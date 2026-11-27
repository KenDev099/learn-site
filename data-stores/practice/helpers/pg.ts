// PostgreSQL（第 11、12、15 課）：每一課用自己的 schema t<NN>，每個測試檔開始前 DROP SCHEMA … CASCADE 再重建
// 連線的 search_path 設成這個 schema，所以 SQL 裡直接寫表名（products、outbox）就好
// 用法：const pool = usePg(11)
import { after, before } from 'node:test'
import pg from 'pg'
import { notRunning } from './service.ts'

export const PG_URL = 'postgres://learn:learn@127.0.0.1:16432/coffee'

export function usePg(lesson: number, options: pg.PoolConfig = {}) {
  const schema = `t${String(lesson).padStart(2, '0')}`
  const pool = new pg.Pool({ connectionString: PG_URL, options: `-c search_path=${schema}`, connectionTimeoutMillis: 3_000, max: 10, ...options })
  before(async () => {
    try {
      await pool.query('SELECT 1')
    } catch (e) {
      throw notRunning('PostgreSQL（127.0.0.1:16432）', 'pg', e)
    }
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema}`)
  })
  after(() => pool.end())
  return pool
}
