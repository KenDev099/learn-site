// 錯誤寫法：存到 Redis 了，但沒有期限
import type { Redis } from 'ioredis'

export async function addItem(redis: Redis, sid: string, productId: number): Promise<void> {
  await redis.rpush(`cart:${sid}`, productId)
}

export async function getCart(redis: Redis, sid: string): Promise<number[]> {
  return (await redis.lrange(`cart:${sid}`, 0, -1)).map(Number)
}
