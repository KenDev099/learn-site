// 練習 4：冪等鍵
// ds:idem:<key>：string。執行中是 PROCESSING；完成後是 JSON.stringify({ result })；兩種狀態都要有 TTL（ttlMs）
import type { Redis } from 'ioredis'

export const PROCESSING = 'processing'

export class ConflictError extends Error {
  constructor(key: string) {
    super(`冪等鍵 ${key} 的請求還在處理中`)
    this.name = 'ConflictError'
  }
}

// 第一次：執行 fn、存下結果再回傳；之後同一個 key：直接回傳存好的結果，不再執行 fn
// 同一個 key 還在執行中：丟出 ConflictError；fn 丟錯：刪掉 key 讓之後可以重試，並把錯誤丟出去
const inFlight = new Set<string>()   // 只在這一台伺服器的記憶體裡

export async function withIdempotency<T>(redis: Redis, key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const k = `ds:idem:${key}`
  if (inFlight.has(k)) throw new ConflictError(key)   // 同一台伺服器裡的重複請求擋得住
  inFlight.add(k)
  const saved = await redis.get(k)
  if (saved !== null) {
    inFlight.delete(k)
    if (saved === PROCESSING) throw new ConflictError(key)
    return (JSON.parse(saved) as { result: T }).result
  }
  await redis.set(k, PROCESSING, 'PX', ttlMs)
  try {
    const result = await fn()
    await redis.set(k, JSON.stringify({ result }), 'PX', ttlMs)
    return result
  } catch (e) {
    await redis.del(k)
    throw e
  } finally {
    inFlight.delete(k)
  }
}
