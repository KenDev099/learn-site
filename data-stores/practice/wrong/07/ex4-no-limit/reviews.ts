// 練習 4：顧客評論
// 評論會隨時間無限成長：內嵌在門市文件裡，門市文件會越來越大，每次讀活動頁都要把全部評論一起載入，
// 最後碰到單一文件 16 MB 的上限。所以評論放在獨立的 reviews 集合，用 storeId 參照門市。
//
// reviews 集合：{ _id, storeId（參照 stores._id）, customerId, rating, text, createdAt: Date }
import type { Db, ObjectId } from 'mongodb'

export type Review = { storeId: ObjectId; customerId: number; rating: number; text: string; createdAt: Date }

// 新增一則評論，createdAt 用參數 now
export async function addReview(db: Db, storeId: ObjectId, review: { customerId: number; rating: number; text: string }, now: Date): Promise<void> {
  await db.collection<Review>('reviews').insertOne({ storeId, ...review, createdAt: now })
}

// 回傳這家門市最新的 limit 則評論，由新到舊
export async function latestReviews(db: Db, storeId: ObjectId, limit: number): Promise<Review[]> {
  return db.collection<Review>('reviews').find({ storeId }).sort({ createdAt: -1 }).toArray()
}
