// 練習 2：最近瀏覽的商品
// key：ds:recent:<userId>，型別 list，最新的在最前面，不重複，最多 5 個
import type { Redis } from 'ioredis'

export const RECENT_LIMIT = 5

const recentKey = (userId: number) => `ds:recent:${userId}`

export async function recordView(redis: Redis, userId: number, productId: number): Promise<void> {
  const key = recentKey(userId)
  await redis.lrem(key, 0, productId)          // 0：刪掉所有等於 productId 的元素
  await redis.lpush(key, productId)            // 放到最前面
  await redis.ltrim(key, 0, RECENT_LIMIT - 1)  // 只留索引 0～4
}

// 回傳 productId 陣列（number），最新的在前
export async function getRecent(redis: Redis, userId: number): Promise<number[]> {
  return (await redis.lrange(recentKey(userId), 0, -1)).map(Number)
}
