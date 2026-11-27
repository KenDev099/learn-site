// 練習 1：固定視窗限流
// key：ds:rl:<key>:<視窗編號>，視窗編號 = Math.floor(now / windowMs)，型別 string（INCR 的計數）
// 每次都送 PEXPIRE key windowMs NX：key 還沒有過期時間才設定，已經有就不動
import type { Redis } from 'ioredis'

export type Decision = { allowed: boolean, remaining: number, resetAt: number }

// now 是現在的時間（毫秒），由呼叫的人傳入，不要用 Date.now()
// remaining：這個視窗還能打幾次（最小 0）；resetAt：這個視窗結束的時間（毫秒）
export async function allow(redis: Redis, key: string, limit: number, windowMs: number, now: number): Promise<Decision> {
  const window = Math.floor(now / windowMs)
  const redisKey = `ds:rl:${key}:${window}`
  const count = await redis.incr(redisKey)
  await redis.pexpire(redisKey, windowMs, 'NX')
  return { allowed: count <= 5, remaining: Math.max(0, 5 - count), resetAt: (window + 1) * windowMs }
}
