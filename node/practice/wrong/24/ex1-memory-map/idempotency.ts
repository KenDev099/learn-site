// 練習 2：冪等鍵存到 PostgreSQL
import type pg from 'pg'
import { withTransaction } from './db.ts'

// 存起來、重送時原樣回傳的回應
export type Saved = { status: number, body: unknown }

// 第 14 課的做法：存在這個程序的記憶體裡。
// 只有一個程序時沒問題；cluster 開兩個 worker，兩邊各有一份 Map，同一個 key 會建立兩筆訂單；程序重啟就全忘了。
const keys = new Map<string, { fingerprint: string, response: Saved }>()

// key：Idempotency-Key 標頭；fingerprint：請求內容的指紋；work：真正建立訂單的工作（在交易裡執行）
// 回傳要送給客戶端的回應；同一個 key 換了內容時回傳 'mismatch'
// TODO：改成存到 idempotency_keys 表（先在 schema.sql 建表），用 INSERT … ON CONFLICT DO NOTHING 判斷誰先到
export async function withIdempotency(pool: pg.Pool, key: string, fingerprint: string, work: (client: pg.PoolClient) => Promise<Saved>): Promise<Saved | 'mismatch'> {
  const hit = keys.get(key)
  if (hit) return hit.fingerprint === fingerprint ? hit.response : 'mismatch'
  const response = await withTransaction(pool, work)
  keys.set(key, { fingerprint, response })
  return response
}
