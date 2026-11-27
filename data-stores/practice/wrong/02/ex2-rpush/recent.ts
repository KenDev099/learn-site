// 練習 2：最近瀏覽的商品
// key：ds:recent:<userId>，型別 list，最新的在最前面，不重複，最多 5 個
import type { Redis } from 'ioredis'

export const RECENT_LIMIT = 5

const recentKey = (userId: number) => `ds:recent:${userId}`

export async function recordView(redis: Redis, userId: number, productId: number): Promise<void> {
  const key = recentKey(userId)
  await redis.lrem(key, 0, productId)          // 0：刪掉所有等於 productId 的元素
  await redis.rpush(key, productId)
  await redis.ltrim(key, -RECENT_LIMIT, -1)
}

// 回傳 productId 陣列（number），最新的在前
export async function getRecent(redis: Redis, userId: number): Promise<number[]> {
  return (await redis.lrange(recentKey(userId), 0, -1)).map(Number)
}
