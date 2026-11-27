// 練習 1：購物車
// key：ds:cart:<userId>，型別 hash，欄位是 productId，值是數量
// 每次寫入都把整個購物車的 TTL 重設為 7 天
import type { Redis } from 'ioredis'

export const CART_TTL_SECONDS = 7 * 24 * 60 * 60

const cartKey = (userId: number) => `ds:cart:${userId}`

// 加 qty 個（qty 可以是負數，代表減少）；減到 0 或以下時把這個商品從購物車移除
export async function addItem(redis: Redis, userId: number, productId: number, qty: number): Promise<void> {
  const key = cartKey(userId)
  const count = await redis.hincrby(key, String(productId), qty)
  if (count <= 0) await redis.hdel(key, String(productId))
  if (count === qty) await redis.expire(key, CART_TTL_SECONDS)   // 只在建立時設
}

// 把這個商品整個移除
export async function removeItem(redis: Redis, userId: number, productId: number): Promise<void> {
  await redis.hdel(cartKey(userId), String(productId))
}

// 回傳 { productId: 數量 }，數量是 number；空購物車回傳 {}
export async function getCart(redis: Redis, userId: number): Promise<Record<string, number>> {
  const raw = await redis.hgetall(cartKey(userId))
  return Object.fromEntries(Object.entries(raw).map(([productId, qty]) => [productId, Number(qty)]))
}

export async function clearCart(redis: Redis, userId: number): Promise<void> {
  await redis.del(cartKey(userId))
}
