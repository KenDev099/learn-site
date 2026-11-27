// 練習 2：轉移點數（WATCH／MULTI 樂觀鎖）
// key：ds:points:<customerId>，型別 string，值是整數；不存在當成 0
// 流程：WATCH 兩個 key → 讀 from 的點數 → 不夠就 UNWATCH 並丟 InsufficientPointsError
//       → 呼叫 hooks.beforeExec（測試用，可能不存在）→ MULTI 扣 from、加 to → EXEC
//       EXEC 回 null（WATCH 的 key 被別人改了）就從頭再來；最多試 MAX_ATTEMPTS 次，都失敗丟 RetryExhaustedError
// 注意：WATCH 綁在連線上，WATCH、讀取、MULTI/EXEC 都要用同一個 redis
import type { Redis } from 'ioredis'

export const MAX_ATTEMPTS = 5

export class InsufficientPointsError extends Error {}
export class RetryExhaustedError extends Error {}

export type Hooks = { beforeExec?: () => Promise<void> | void }

export async function transferPoints(redis: Redis, from: number, to: number, amount: number, hooks: Hooks = {}): Promise<void> {
  // 寫在這裡
}
