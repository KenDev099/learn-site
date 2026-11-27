// 練習 3：限量優惠券（Lua）
// key：ds:coupon:<campaign>:stock    string，剩下幾張；不存在當成 0
//      ds:coupon:<campaign>:claimed  set，領過的 customerId
// 規則：先看「領過了沒」，再看「還有沒有」，最後扣庫存並記下這位客人，全部在同一個 Lua 腳本裡做完
// 回傳：'ok'｜'sold-out'｜'already-claimed'（已經領過的人，就算賣完也回 'already-claimed'）
// 腳本裡不能出現 key 名稱：key 一律從 KEYS 傳入，customerId 從 ARGV 傳入
import type { Redis } from 'ioredis'

export type ClaimResult = 'ok' | 'sold-out' | 'already-claimed'

// KEYS[1] = stock、KEYS[2] = claimed；ARGV[1] = customerId
export const CLAIM_LUA = `
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then
  return 'already-claimed'
end
local stock = tonumber(redis.call('GET', KEYS[1]) or '0')
if stock <= 0 then
  return 'sold-out'
end
redis.call('DECR', KEYS[1])
redis.call('SADD', KEYS[2], ARGV[1])
return 'ok'
`

export async function claim(redis: Redis, campaign: string, customerId: number): Promise<ClaimResult> {
  const prefix = `ds:coupon:${campaign}`
  await redis.eval('return 1', 0)
  const [[, claimed], [, stock]] = (await redis.multi().sismember(`${prefix}:claimed`, customerId).get(`${prefix}:stock`).exec())!
  if (claimed === 1) return 'already-claimed'
  if (Number(stock ?? 0) <= 0) return 'sold-out'
  await redis.multi().decr(`${prefix}:stock`).sadd(`${prefix}:claimed`, customerId).exec()
  return 'ok'
}
