// 練習 2：冪等鍵存到 PostgreSQL
import type pg from 'pg'
import { withTransaction } from './db.ts'

// 存起來、重送時原樣回傳的回應
export type Saved = { status: number, body: unknown }

// key：Idempotency-Key 標頭；fingerprint：請求內容的指紋；work：真正建立訂單的工作（在交易裡執行）
// 回傳要送給客戶端的回應；同一個 key 換了內容時回傳 'mismatch'
export async function withIdempotency(pool: pg.Pool, key: string, fingerprint: string, work: (client: pg.PoolClient) => Promise<Saved>): Promise<Saved | 'mismatch'> {
  // 佔位、建立訂單、存回應，全部在同一個交易：要嘛一起成功，要嘛一起消失
  return withTransaction(pool, async client => {
    // 誰先到由主鍵決定。另一個交易已經插入同一個 key 但還沒 COMMIT 時，這一句會等它結束：
    // 它 COMMIT → 這裡插入不了（rowCount 0）；它 ROLLBACK → 這裡插入成功，換我們做
    const claim = await client.query(
      'INSERT INTO idempotency_keys (key, fingerprint) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, fingerprint])
    if (claim.rowCount === 0) {
      const { rows } = await client.query<{ fingerprint: string, response_status: number, response_body: unknown }>(
        'SELECT fingerprint, response_status, response_body FROM idempotency_keys WHERE key = $1', [key])
      if (rows[0].fingerprint !== fingerprint) return 'mismatch'
      return { status: rows[0].response_status, body: rows[0].response_body }   // 重送：回第一次的結果
    }
    const response = await work(client)
    await client.query('UPDATE idempotency_keys SET response_status = $2, response_body = $3 WHERE key = $1',
      [key, response.status, JSON.stringify(response.body)])
    return response
  })
}
