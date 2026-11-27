// 練習 3：用一個 aggregation pipeline 算各城市營業中門市的統計
// stores 集合：{ name, city, status: 'open' | 'closed' | 'renovating', rating: number, reviewCount: number }
// 每個城市一筆（只算 status 是 'open' 的門市）：
//   city：城市；avgRating：平均評分；reviews：reviewCount 加總；topStore：評分最高的門市名稱
// 依 avgRating 由高到低排序
import type { Collection } from 'mongodb'

export type Store = { name: string; city: string; status: 'open' | 'closed' | 'renovating'; rating: number; reviewCount: number }
export type CityStats = { city: string; avgRating: number; reviews: number; topStore: string }

export async function cityStats(stores: Collection<Store>): Promise<CityStats[]> {
  // 寫在這裡
  return []
}
