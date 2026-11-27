// 練習 4：評論的 keyset 分頁
// reviews 集合：{ _id: ObjectId, storeId: number, createdAt: Date, text: string }
// 排序：createdAt 新到舊；createdAt 相同時 _id 大的在前
// 每頁 PAGE_SIZE 則；next 是下一頁要傳回來的游標，沒有下一頁時是 null
import type { Collection, Filter, ObjectId } from 'mongodb'

export const PAGE_SIZE = 20

export type Review = { _id: ObjectId; storeId: number; createdAt: Date; text: string }
export type Cursor = { createdAt: Date; _id: ObjectId }

// 建立 listReviews 需要的索引
export async function ensureReviewIndex(reviews: Collection<Review>): Promise<void> {
  // 等值 storeId 在前，排序的 createdAt、_id 接著，方向跟 sort 一致
  await reviews.createIndex({ storeId: 1, createdAt: -1, _id: -1 })
}

export async function listReviews(reviews: Collection<Review>, storeId: number, after?: Cursor): Promise<{ items: Review[]; next: Cursor | null }> {
  const filter: Filter<Review> = { storeId }
  // 算出游標前面有幾則，再 skip 過去：結果對，但每一頁都要從頭掃
  const offset = after ? await reviews.countDocuments({ storeId, $or: [{ createdAt: { $gt: after.createdAt } }, { createdAt: after.createdAt, _id: { $gte: after._id } }] }) : 0
  const items = await reviews.find(filter).sort({ createdAt: -1, _id: -1 }).skip(offset).limit(PAGE_SIZE + 1).toArray()
  const more = items.length > PAGE_SIZE
  if (more) items.pop()
  const last = items.at(-1)
  return { items, next: more && last ? { createdAt: last.createdAt, _id: last._id } : null }
}
