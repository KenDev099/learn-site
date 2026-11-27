// 練習 3：每週人氣排行
// key：ds:rank:<week>（例如 ds:rank:2026-W45），型別 sorted set，成員是 productId，分數是累計銷量
import type { Redis } from 'ioredis'

const rankKey = (week: string) => `ds:rank:${week}`

// 這一週 productId 又賣出 qty 杯
export async function addSales(redis: Redis, week: string, productId: number, qty: number): Promise<void> {
  // 寫在這裡
}

// 這一週銷量前 n 名，由高到低；productId 與 sold 都是 number；n ≤ 0 時回傳 []
export async function top(redis: Redis, week: string, n: number): Promise<{ productId: number, sold: number }[]> {
  return []
}
