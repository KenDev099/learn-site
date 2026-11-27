// 練習 4：評論的 keyset 分頁
// reviews 集合：{ _id: ObjectId, storeId: number, createdAt: Date, text: string }
// 排序：createdAt 新到舊；createdAt 相同時 _id 大的在前
// 每頁 PAGE_SIZE 則；next 是下一頁要傳回來的游標，沒有下一頁時是 null
import type { Collection, ObjectId } from 'mongodb'

export const PAGE_SIZE = 20

export type Review = { _id: ObjectId; storeId: number; createdAt: Date; text: string }
export type Cursor = { createdAt: Date; _id: ObjectId }

// 建立 listReviews 需要的索引
export async function ensureReviewIndex(reviews: Collection<Review>): Promise<void> {
  // 寫在這裡
}

export async function listReviews(reviews: Collection<Review>, storeId: number, after?: Cursor): Promise<{ items: Review[]; next: Cursor | null }> {
  // 寫在這裡
  return { items: [], next: null }
}
