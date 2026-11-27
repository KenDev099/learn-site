// 練習 4：每天來過的會員
// key 自己設計：要帶日期（date 是 '2026-11-01' 這種格式），開頭用 ds:
import type { Redis } from 'ioredis'

export async function markVisit(redis: Redis, date: string, customerId: number): Promise<void> {
  // 寫在這裡
}

// 這一天有幾位不同的會員來過
export async function countVisitors(redis: Redis, date: string): Promise<number> {
  return 0
}

// dates 裡的每一天都有來的會員 id，由小到大排序；dates 是空陣列時回傳 []
export async function loyal(redis: Redis, dates: string[]): Promise<number[]> {
  return []
}
