// 練習 4：自動清理
// applyLifecycle(store)：設定 bucket 的生命週期規則（PutBucketLifecycleConfiguration）
//   - tmp/ 底下的物件 1 天後刪除（prefix 寫在 Filter 裡，Garage 不接受舊式的 Rule.Prefix）
//   - 整個 bucket 中斷的分段上傳，開始 1 天後清掉（AbortIncompleteMultipartUpload）
//   - receipts/ 底下的正式收據不能被任何規則刪掉
// cleanupOrphans(pool, store, olderThan)：olderThan 是毫秒時間戳
//   1. created_at 早於 olderThan 的 pending 紀錄：刪掉紀錄，也刪掉它的物件（可能已經上傳但沒人確認）
//   2. receipts/ 底下沒有任何紀錄指到的物件（孤兒）：刪掉。ListObjectsV2 一頁最多 1,000 個，要用 ContinuationToken 走完
//   tmp/ 等其他 prefix 不歸這個函式管；回傳刪了幾個物件、幾筆 pending 紀錄
import type pg from 'pg'
import type { Store } from './receipts.ts'

export async function applyLifecycle(store: Store): Promise<void> {
  // 寫在這裡
}

export async function cleanupOrphans(pool: pg.Pool, store: Store, olderThan: number): Promise<{ deletedObjects: number; deletedPending: number }> {
  // 寫在這裡
  return { deletedObjects: 0, deletedPending: 0 }
}
