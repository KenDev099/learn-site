// 練習 4：替 stream 設上限
import type { Redis } from 'ioredis'

// XADD 一筆（id 讓 Redis 產生），同時用「近似」修剪讓長度維持在 maxLen 附近；回傳新的 id
// fields 例如 { type: 'paid', orderId: 12 }，數字照樣寫進去（Redis 存成字串）
export async function appendEvent(redis: Redis, stream: string, fields: Record<string, string | number>, maxLen: number): Promise<string> {
  const id = await redis.xadd(stream, 'MAXLEN', '~', maxLen, '*', ...Object.entries(fields).flat())
  return id as string
}

// 精確地刪掉時間早於 cutoffMs（毫秒時間戳）的所有訊息，回傳刪了幾筆
export async function trimOlderThan(redis: Redis, stream: string, cutoffMs: number): Promise<number> {
  return redis.xtrim(stream, 'MINID', Math.floor(cutoffMs / 1000))
}
