// 錯誤寫法：先 SELECT 看有沒有，沒有才做事再 INSERT（check-then-act）
import type pg from 'pg'
import { withTransaction } from './db.ts'

export type Saved = { status: number, body: unknown }

export async function withIdempotency(pool: pg.Pool, key: string, fingerprint: string, work: (client: pg.PoolClient) => Promise<Saved>): Promise<Saved | 'mismatch'> {
  const { rows } = await pool.query('SELECT fingerprint, response_status, response_body FROM idempotency_keys WHERE key = $1', [key])
  if (rows.length) return rows[0].fingerprint === fingerprint ? { status: rows[0].response_status, body: rows[0].response_body } : 'mismatch'
  const response = await withTransaction(pool, work)
  await pool.query('INSERT INTO idempotency_keys (key, fingerprint, response_status, response_body) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
    [key, fingerprint, response.status, JSON.stringify(response.body)])
  return response
}
