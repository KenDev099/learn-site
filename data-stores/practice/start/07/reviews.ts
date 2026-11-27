// 練習 4：顧客評論
// 在這裡用一兩句註解寫下：評論為什麼不內嵌在門市文件裡？
//
// reviews 集合：{ _id, storeId（參照 stores._id）, customerId, rating, text, createdAt: Date }
import type { Db, ObjectId } from 'mongodb'

export type Review = { storeId: ObjectId; customerId: number; rating: number; text: string; createdAt: Date }

// 新增一則評論，createdAt 用參數 now
export async function addReview(db: Db, storeId: ObjectId, review: { customerId: number; rating: number; text: string }, now: Date): Promise<void> {
  // 寫在這裡
}

// 回傳這家門市最新的 limit 則評論，由新到舊
export async function latestReviews(db: Db, storeId: ObjectId, limit: number): Promise<Review[]> {
  return []
}
