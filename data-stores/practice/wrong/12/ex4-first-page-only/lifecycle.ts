// 練習 4：自動清理
// applyLifecycle(store)：設定 bucket 的生命週期規則（PutBucketLifecycleConfiguration）
//   - tmp/ 底下的物件 1 天後刪除（prefix 寫在 Filter 裡，Garage 不接受舊式的 Rule.Prefix）
//   - 整個 bucket 中斷的分段上傳，開始 1 天後清掉（AbortIncompleteMultipartUpload）
//   - receipts/ 底下的正式收據不能被任何規則刪掉
// cleanupOrphans(pool, store, olderThan)：olderThan 是毫秒時間戳
//   1. created_at 早於 olderThan 的 pending 紀錄：刪掉紀錄，也刪掉它的物件（可能已經上傳但沒人確認）
//   2. receipts/ 底下沒有任何紀錄指到的物件（孤兒）：刪掉。ListObjectsV2 一頁最多 1,000 個，要用 ContinuationToken 走完
//   tmp/ 等其他 prefix 不歸這個函式管；回傳刪了幾個物件、幾筆 pending 紀錄
import { DeleteObjectsCommand, ListObjectsV2Command, PutBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3'
import type pg from 'pg'
import type { Store } from './receipts.ts'

export async function applyLifecycle(store: Store): Promise<void> {
  await store.s3.send(new PutBucketLifecycleConfigurationCommand({
    Bucket: store.bucket,
    LifecycleConfiguration: {
      Rules: [
        { ID: 'tmp-1-day', Status: 'Enabled', Filter: { Prefix: 'tmp/' }, Expiration: { Days: 1 } },
        { ID: 'abort-multipart-1-day', Status: 'Enabled', Filter: {}, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } },
      ],
    },
  }))
}

export async function cleanupOrphans(pool: pg.Pool, store: Store, olderThan: number): Promise<{ deletedObjects: number; deletedPending: number }> {
  // 1. 超時的 pending：先刪紀錄（RETURNING 拿到 key），它們的物件在第 2 步就變成孤兒
  const stale = await pool.query(
    `DELETE FROM receipts WHERE status = 'pending' AND created_at < to_timestamp($1 / 1000.0) RETURNING s3_key`, [olderThan])

  // 2. 走完 receipts/ 的每一頁，找出沒有紀錄的 key
  let deletedObjects = 0
  let token: string | undefined
  do {
    const page = await store.s3.send(new ListObjectsV2Command({ Bucket: store.bucket, Prefix: 'receipts/', ContinuationToken: token }))
    const keys = (page.Contents ?? []).map(o => o.Key!)
    if (keys.length) {
      const known = await pool.query<{ s3_key: string }>('SELECT s3_key FROM receipts WHERE s3_key = ANY($1)', [keys])
      const has = new Set(known.rows.map(r => r.s3_key))
      const orphans = keys.filter(k => !has.has(k))
      if (orphans.length) {
        await store.s3.send(new DeleteObjectsCommand({ Bucket: store.bucket, Delete: { Objects: orphans.map(Key => ({ Key })), Quiet: true } }))
        deletedObjects += orphans.length
      }
    }
    token = undefined
  } while (token)
  return { deletedObjects, deletedPending: stale.rowCount ?? 0 }
}
