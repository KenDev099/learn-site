// 練習 1：門市查詢的索引、打卡紀錄的 TTL 索引
// stores 集合：{ name: string, city: string, status: 'open' | 'closed' | 'renovating', rating: number, reviewCount: number }
// 要加速的查詢（活動頁的「這個城市營業中的門市，評分高的在前，取 20 家」）：
//   db.collection('stores').find({ status: 'open', city }).sort({ rating: -1 }).limit(20)
// checkins 集合：{ storeId: number, customerId: number, checkedInAt: Date }，打卡後 30 天自動刪除
import type { Db } from 'mongodb'

export async function ensureIndexes(db: Db): Promise<void> {
  // 寫在這裡
}
