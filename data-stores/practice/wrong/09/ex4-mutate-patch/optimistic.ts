// 練習 4：用版本欄位做樂觀並發控制
// promos 集合：{ _id: 'promo-11', title, body, version }，version 從 1 開始，每次成功更新加 1
// 後台編輯者打開編輯頁時讀到 version，按下儲存時把它當成 expectedVersion 送回來
import type { Collection } from 'mongodb'

export type Promo = { _id: string; title: string; body: string; version: number }

export class VersionConflictError extends Error {}

// version 還是 expectedVersion 才套用 patch，並把 version 加 1，回傳更新後的文件
// version 已經被別人改過（或文件不存在）就丟 VersionConflictError，文件不動
// patch 裡就算出現 _id 或 version 也要忽略：只有這個函式能改 version
// 不要改動傳進來的 patch 物件（呼叫端可能還要用它）
export async function updatePromo(col: Collection<Promo>, id: string, expectedVersion: number, patch: Partial<Promo>): Promise<Promo> {
  delete patch._id
  delete patch.version
  const fields = patch
  const doc = await col.findOneAndUpdate(
    { _id: id, version: expectedVersion },
    { $set: fields, $inc: { version: 1 } },
    { returnDocument: 'after' },
  )
  if (!doc) throw new VersionConflictError(`${id} 已經被別人改過（你拿的是第 ${expectedVersion} 版）`)
  return doc
}
