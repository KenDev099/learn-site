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
  // 寫在這裡
  return ''
}

// 找不到回傳 null；找到時把 TTL 延長回 30 分鐘（滑動過期）
export async function getSession(redis: Redis, id: string): Promise<Session | null> {
  // 寫在這裡
  return null
}

export async function destroySession(redis: Redis, id: string): Promise<void> {
  // 寫在這裡
}

// 登出所有裝置：刪掉這位使用者的每一個 session 和索引
export async function destroyAllForUser(redis: Redis, userId: number): Promise<void> {
  // 寫在這裡
}
