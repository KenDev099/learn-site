// 練習 1：購物車放在 Redis，每個副本看到的都是同一份
import type { Redis } from 'ioredis'

const TTL_SECONDS = 24 * 60 * 60
const key = (sid: string) => `cart:${sid}`

// 加進清單尾端，同時把期限重設成 1 天；multi 讓兩個指令一起送出、一起執行
export async function addItem(redis: Redis, sid: string, productId: number): Promise<void> {
  await redis.multi().rpush(key(sid), productId).expire(key(sid), TTL_SECONDS).exec()
}

export async function getCart(redis: Redis, sid: string): Promise<number[]> {
  return (await redis.lrange(key(sid), 0, -1)).map(Number)
}
