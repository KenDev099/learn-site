import type { Collection } from 'mongodb'

export type Store = { name: string; city: string; status: 'open' | 'closed' | 'renovating'; rating: number; reviewCount: number }
export type CityStats = { city: string; avgRating: number; reviews: number; topStore: string }

// 先把全部門市依（城市, 狀態）分組，再篩出 open 的組：結果對，但每一份文件都進了 $group
export async function cityStats(stores: Collection<Store>): Promise<CityStats[]> {
  return stores.aggregate<CityStats>([
    { $sort: { rating: -1 } },
    { $group: { _id: { city: '$city', status: '$status' }, avgRating: { $avg: '$rating' }, reviews: { $sum: '$reviewCount' }, topStore: { $first: '$name' } } },
    { $match: { '_id.status': 'open' } },
    { $sort: { avgRating: -1 } },
    { $project: { _id: 0, city: '$_id.city', avgRating: 1, reviews: 1, topStore: 1 } },
  ]).toArray()
}
