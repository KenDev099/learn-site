// 練習 4：token bucket 限流（Lua）
// key：由呼叫端傳入（例如 ds:bucket:login:<ip>），型別 hash，欄位 tokens（目前代幣數，可以有小數）、ts（上次更新的毫秒時間）
// take 的規則：
//   1. 第一次（key 不存在）時桶子是滿的：tokens = capacity
//   2. 依照距離上次 ts 經過的毫秒補代幣：每秒補 refillPerSec 個，最多補到 capacity；時間倒退時不補
//   3. 代幣 ≥ 1 就拿走一個並放行，否則拒絕
//   4. 把 tokens 和 ts（= now）寫回 hash，並設 TTL：桶子從空補到滿要的毫秒數（無條件進位）
//   5. 回傳 { allowed, tokens }，tokens 是處理後剩下的代幣數（number）
// 時間一律用參數 now（毫秒），不要在腳本裡呼叫 TIME
import type { Redis } from 'ioredis'

export type TakeResult = { allowed: boolean, tokens: number }

export const TAKE_LUA = `
-- 寫在這裡
return {0, '0'}
`

export async function take(redis: Redis, key: string, capacity: number, refillPerSec: number, now: number): Promise<TakeResult> {
  // 寫在這裡
  return { allowed: false, tokens: 0 }
}
