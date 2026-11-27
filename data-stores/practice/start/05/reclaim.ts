// 練習 3：接手當機的消費者手上的訊息，毒訊息移到 dead-letter stream
// dead-letter stream 的名稱：`${stream}:dead`
// 移過去的那一筆：保留原本所有欄位，另外加一個欄位 originalId（原本的 id）
import type { Redis } from 'ioredis'

export type StreamMessage = { id: string, fields: Record<string, string> }

// 1. 用 XAUTOCLAIM 把閒置至少 minIdleMs 毫秒的訊息改歸 consumer（要接手全部，不只第一批）
// 2. 用 XPENDING 查每一筆的送達次數（delivery count，Redis 記錄的，不是你自己數的）
// 3. 送達次數 > maxDeliveries 的：寫到 dead-letter stream，然後 XACK，不回傳
// 回傳其他接手到、要交給 handle 再處理一次的訊息
export async function reclaimStuck(redis: Redis, stream: string, group: string, consumer: string, minIdleMs: number, maxDeliveries: number): Promise<StreamMessage[]> {
  return []
}
