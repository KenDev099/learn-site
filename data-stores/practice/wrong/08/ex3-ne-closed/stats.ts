// 練習 3：用一個 aggregation pipeline 算各城市營業中門市的統計
// stores 集合：{ name, city, status: 'open' | 'closed' | 'renovating', rating: number, reviewCount: number }
// 每個城市一筆（只算 status 是 'open' 的門市）：
//   city：城市；avgRating：平均評分；reviews：reviewCount 加總；topStore：評分最高的門市名稱
// 依 avgRating 由高到低排序
import type { Collection } from 'mongodb'

export type Store = { name: string; city: string; status: 'open' | 'closed' | 'renovating'; rating: number; reviewCount: number }
export type CityStats = { city: string; avgRating: number; reviews: number; topStore: string }

export async function cityStats(stores: Collection<Store>): Promise<CityStats[]> {
  return stores.aggregate<CityStats>([
    { $match: { status: { $ne: 'closed' } } },            // 先篩：只留營業中的，而且用得到 status 開頭的索引
    { $sort: { rating: -1 } },                 // 先排好，$group 的 $first 才是評分最高的
    { $group: {
      _id: '$city',
      avgRating: { $avg: '$rating' },
      reviews: { $sum: '$reviewCount' },
      topStore: { $first: '$name' },
    } },
    { $sort: { avgRating: -1, _id: 1 } },
    { $project: { _id: 0, city: '$_id', avgRating: 1, reviews: 1, topStore: 1 } },
  ]).toArray()
}
