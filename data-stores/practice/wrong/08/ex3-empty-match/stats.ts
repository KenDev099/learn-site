import type { Collection } from 'mongodb'

export type Store = { name: string; city: string; status: 'open' | 'closed' | 'renovating'; rating: number; reviewCount: number }
export type CityStats = { city: string; avgRating: number; reviews: number; topStore: string }

// 第一個 stage 是 $match，但什麼都沒篩；真正的篩選在 $group 之後
export async function cityStats(stores: Collection<Store>): Promise<CityStats[]> {
  return stores.aggregate<CityStats>([
    { $match: {} },
    { $sort: { rating: -1 } },
    { $group: { _id: { city: '$city', status: '$status' }, avgRating: { $avg: '$rating' }, reviews: { $sum: '$reviewCount' }, topStore: { $first: '$name' } } },
    { $match: { '_id.status': 'open' } },
    { $sort: { avgRating: -1 } },
    { $project: { _id: 0, city: '$_id.city', avgRating: 1, reviews: 1, topStore: 1 } },
  ]).toArray()
}
