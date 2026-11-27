import type { Collection } from 'mongodb'

export type Store = { name: string; city: string; status: 'open' | 'closed' | 'renovating'; rating: number; reviewCount: number }
export type CityStats = { city: string; avgRating: number; reviews: number; topStore: string }

// 拿回全部營業中的門市，在 Node 端分組
export async function cityStats(stores: Collection<Store>): Promise<CityStats[]> {
  const list = await stores.find({ status: 'open' }).toArray()
  const by = new Map<string, Store[]>()
  for (const s of list) by.set(s.city, [...(by.get(s.city) ?? []), s])
  return [...by].map(([city, ss]) => ({
    city,
    avgRating: ss.reduce((a, s) => a + s.rating, 0) / ss.length,
    reviews: ss.reduce((a, s) => a + s.reviewCount, 0),
    topStore: ss.reduce((a, s) => s.rating > a.rating ? s : a).name,
  })).sort((a, b) => b.avgRating - a.avgRating)
}
