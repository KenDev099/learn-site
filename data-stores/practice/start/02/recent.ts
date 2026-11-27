// 練習 2：最近瀏覽的商品
// key：ds:recent:<userId>，型別 list，最新的在最前面，不重複，最多 5 個
import type { Redis } from 'ioredis'

export const RECENT_LIMIT = 5

const recentKey = (userId: number) => `ds:recent:${userId}`

export async function recordView(redis: Redis, userId: number, productId: number): Promise<void> {
  // 寫在這裡
}

// 回傳 productId 陣列（number），最新的在前
export async function getRecent(redis: Redis, userId: number): Promise<number[]> {
  return []
}
