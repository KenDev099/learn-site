// 錯誤寫法：RPUSH 和 EXPIRE 分開送，中間被停掉就留下沒有期限的 key
import type { Redis } from 'ioredis'

const key = (sid: string) => `cart:${sid}`

export async function addItem(redis: Redis, sid: string, productId: number): Promise<void> {
  await redis.rpush(key(sid), productId)
  await redis.expire(key(sid), 86_400)
}

export async function getCart(redis: Redis, sid: string): Promise<number[]> {
  return (await redis.lrange(key(sid), 0, -1)).map(Number)
}
