// 練習 3：限量優惠券（Lua）
// key：ds:coupon:<campaign>:stock    string，剩下幾張；不存在當成 0
//      ds:coupon:<campaign>:claimed  set，領過的 customerId
// 規則：先看「領過了沒」，再看「還有沒有」，最後扣庫存並記下這位客人，全部在同一個 Lua 腳本裡做完
// 回傳：'ok'｜'sold-out'｜'already-claimed'（已經領過的人，就算賣完也回 'already-claimed'）
// 腳本裡不能出現 key 名稱：key 一律從 KEYS 傳入，customerId 從 ARGV 傳入
import type { Redis } from 'ioredis'

export type ClaimResult = 'ok' | 'sold-out' | 'already-claimed'

export const CLAIM_LUA = `
-- 寫在這裡
return 'sold-out'
`

export async function claim(redis: Redis, campaign: string, customerId: number): Promise<ClaimResult> {
  // 寫在這裡
  return 'sold-out'
}
