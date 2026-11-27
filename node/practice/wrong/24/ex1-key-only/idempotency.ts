// 錯誤寫法：只記 key 和指紋，不存回應；重送時拿不到第一次的結果
import type pg from 'pg'
import { withTransaction } from './db.ts'

export type Saved = { status: number, body: unknown }

export async function withIdempotency(pool: pg.Pool, key: string, fingerprint: string, work: (client: pg.PoolClient) => Promise<Saved>): Promise<Saved | 'mismatch'> {
  return withTransaction(pool, async client => {
    const claim = await client.query('INSERT INTO idempotency_keys (key, fingerprint) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, fingerprint])
    if (claim.rowCount === 0) {
      const { rows } = await client.query('SELECT fingerprint FROM idempotency_keys WHERE key = $1', [key])
      if (rows[0].fingerprint !== fingerprint) return 'mismatch'
      return { status: 409, body: { error: { code: 'DUPLICATE', message: '這個請求已經處理過了' } } }
    }
    return work(client)
  })
}
