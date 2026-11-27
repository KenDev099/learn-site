// 練習 3：部分更新
// stores 集合：{ _id, name, photos: { url, alt }[], promos: { id, title }[] }
// checkins 集合：每家門市每天一份 { storeId, date: 'YYYY-MM-DD'（台北日期）, count }
import type { Collection, ObjectId } from 'mongodb'

export type Photo = { url: string; alt: string }
export type Store = { _id: ObjectId; name: string; status: string; photos: Photo[]; promos: { id: number; title: string }[] }
export type Checkin = { storeId: ObjectId; date: string; count: number }

export const MAX_PHOTOS = 20

// 台北日期，例如 2026-11-01T16:30:00Z → '2026-11-02'
export const taipeiDate = (now: Date) => new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10)

// 把 photo 加到 photos 的最後面，只保留最新的 MAX_PHOTOS 張（依加入順序，最舊的在前）
export async function addPhoto(col: Collection<Store>, storeId: ObjectId, photo: Photo): Promise<void> {
  await col.updateOne({ _id: storeId }, { $push: { photos: { $each: [photo], $slice: -MAX_PHOTOS } } })
}

// 只把 promos 裡 id 等於 promoId 的那一個活動改名，其他活動、其他欄位不動
export async function renamePromo(col: Collection<Store>, storeId: ObjectId, promoId: number, title: string): Promise<void> {
  await col.updateOne({ _id: storeId }, { $set: { 'promos.0.title': title } })
}

// 在 checkins 集合把這家門市「今天」的 count 加 1；今天還沒有文件就建立一份（count 從 1 開始）
export async function checkIn(col: Collection<Checkin>, storeId: ObjectId, now: Date): Promise<void> {
  await col.updateOne({ storeId, date: taipeiDate(now) }, { $inc: { count: 1 } }, { upsert: true })
}

// 在 checkins 集合建立 { storeId: 1, date: 1 } 的唯一索引
export async function ensureCheckinIndex(col: Collection<Checkin>): Promise<void> {
  await col.createIndex({ storeId: 1, date: 1 }, { unique: true })
}
