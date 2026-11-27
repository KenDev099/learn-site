// 練習 2：outbox worker：把待送出的事件用 bulk 寫進 Elasticsearch
// runOnce(pool, es, index, batchSize) 做一輪，回傳這一輪「處理完成」的事件數（沒有事件時回傳 0）：
//   1. 在交易裡取最多 batchSize 筆 processed_at IS NULL 的事件（ORDER BY id），兩個 worker 同時跑時不能拿到同一筆、也不能互等
//   2. 一個 es.bulk 請求送出：
//        upsert → { index: { _index: index, _id: String(aggregate_id), version, version_type: 'external' } } 加上 payload
//        delete → { delete: { _index: index, _id: String(aggregate_id), version, version_type: 'external' } }
//   3. 逐筆看 bulk 的回應（HTTP 200 不代表每筆都成功）：
//        status < 300：成功
//        409（版本衝突）：ES 已經有更新的版本，這筆舊事件算處理完成
//        delete 的 404（文件本來就不在）：算處理完成
//        其他錯誤：不標記完成，attempts 加 1、last_error 記下錯誤原因
//   4. 完成的事件設 processed_at = now()，COMMIT
//   bulk 整個請求失敗（ES 連不上、逾時）：ROLLBACK，把錯誤往外丟，事件留著下一輪再送
// index 傳進來的是別名（t11-menu），程式裡不要寫死索引名稱
import type { Pool } from 'pg'
import type { Client } from '@elastic/elasticsearch'
import type { OutboxEvent } from './schema.ts'

export type { OutboxEvent }

export async function runOnce(pool: Pool, es: Client, index: string, batchSize = 100): Promise<number> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<OutboxEvent>(
      `SELECT id, aggregate_id, version, op, payload FROM outbox
        WHERE processed_at IS NULL
        ORDER BY id
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [batchSize],
    )
    if (rows.length === 0) {
      await client.query('COMMIT')
      return 0
    }
    const res = await es.bulk({
      operations: rows.flatMap((e): object[] => {
        const meta = { _index: index, _id: String(e.aggregate_id), version: e.version, version_type: 'external' as const }
        return e.op === 'delete' ? [{ delete: meta }] : [{ index: meta }, e.payload!]
      }),
    })
    const done: string[] = []
    for (const [i, item] of res.items.entries()) {
      const r = (item.index ?? item.delete)!
      if (r.status < 300 || r.status === 409 || (item.delete && r.status === 404)) {
        done.push(rows[i].id)
      } else {
        await client.query('UPDATE outbox SET attempts = attempts + 1, last_error = $2 WHERE id = $1', [rows[i].id, JSON.stringify(r.error)])
      }
    }
    await client.query('UPDATE outbox SET processed_at = now() WHERE id = ANY($1::bigint[])', [done])
    await client.query('COMMIT')
    return rows.length
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
