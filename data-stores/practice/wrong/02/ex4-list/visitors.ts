// 練習 4：每天來過的會員
// key 自己設計：要帶日期（date 是 '2026-11-01' 這種格式），開頭用 ds:
import type { Redis } from 'ioredis'

const visitKey = (date: string) => `ds:visitors:${date}`

export async function markVisit(redis: Redis, date: string, customerId: number): Promise<void> {
  await redis.rpush(visitKey(date), customerId)
}

// 這一天有幾位不同的會員來過
export async function countVisitors(redis: Redis, date: string): Promise<number> {
  return redis.llen(visitKey(date))
}

// dates 裡的每一天都有來的會員 id，由小到大排序；dates 是空陣列時回傳 []
export async function loyal(redis: Redis, dates: string[]): Promise<number[]> {
  if (dates.length === 0) return []
  const lists = await Promise.all(dates.map(d => redis.lrange(visitKey(d), 0, -1)))
  const ids = [...new Set(lists[0])].filter(id => lists.every(l => l.includes(id)))
  return ids.map(Number).sort((a, b) => a - b)
}
