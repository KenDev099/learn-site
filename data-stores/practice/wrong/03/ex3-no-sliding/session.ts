// 練習 3：伺服器端 session
// ds:session:<id>：hash，欄位 userId、role；PTTL 30 分鐘，每次 getSession 都延長回 30 分鐘
// ds:user-sessions:<userId>：set，這位使用者所有的 session id（「登出所有裝置」用）
import { randomBytes } from 'node:crypto'
import type { Redis } from 'ioredis'

export const SESSION_TTL_MS = 30 * 60 * 1000

export type Session = { userId: number, role: string }

const sessionKey = (id: string) => `ds:session:${id}`
const indexKey = (userId: number) => `ds:user-sessions:${userId}`

// 回傳新的 session id：32 bytes 的安全亂數，base64url 編碼（43 個字元）
export async function createSession(redis: Redis, userId: number, data: { role: string }): Promise<string> {
  const id = randomBytes(32).toString('base64url')
  await redis.hset(sessionKey(id), { userId: String(userId), role: data.role })
  await redis.pexpire(sessionKey(id), SESSION_TTL_MS)
  await redis.sadd(indexKey(userId), id)
  await redis.pexpire(indexKey(userId), SESSION_TTL_MS)
  return id
}

// 找不到回傳 null；找到時把 TTL 延長回 30 分鐘（滑動過期）
export async function getSession(redis: Redis, id: string): Promise<Session | null> {
  const raw = await redis.hgetall(sessionKey(id))
  if (!raw.userId) return null
  const session = { userId: Number(raw.userId), role: raw.role }
  return session
}

export async function destroySession(redis: Redis, id: string): Promise<void> {
  const userId = await redis.hget(sessionKey(id), 'userId')
  await redis.del(sessionKey(id))
  if (userId !== null) await redis.srem(indexKey(Number(userId)), id)
}

// 登出所有裝置：刪掉這位使用者的每一個 session 和索引
export async function destroyAllForUser(redis: Redis, userId: number): Promise<void> {
  const ids = await redis.smembers(indexKey(userId))
  await redis.del(...ids.map(sessionKey), indexKey(userId))
}
