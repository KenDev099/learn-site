// 練習 3：每週人氣排行
// key：ds:rank:<week>（例如 ds:rank:2026-W45），型別 sorted set，成員是 productId，分數是累計銷量
import type { Redis } from 'ioredis'

const rankKey = (week: string) => `ds:rank:${week}`

// 這一週 productId 又賣出 qty 杯
export async function addSales(redis: Redis, week: string, productId: number, qty: number): Promise<void> {
  await redis.zincrby(rankKey(week), qty, productId)
}

// 這一週銷量前 n 名，由高到低；productId 與 sold 都是 number
export async function top(redis: Redis, week: string, n: number): Promise<{ productId: number, sold: number }[]> {
  const flat = await redis.zrange(rankKey(week), 0, String(n), 'REV', 'WITHSCORES')   // [成員, 分數, 成員, 分數, …]
  const result: { productId: number, sold: number }[] = []
  for (let i = 0; i < flat.length; i += 2) result.push({ productId: Number(flat[i]), sold: Number(flat[i + 1]) })
  return result
}
