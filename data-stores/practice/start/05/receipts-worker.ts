// 練習 2：寄電子收據的 worker（consumer group）
// stream 裡每一筆是一個事件，例如 type=paid orderId=12
// group 從 stream 的開頭（id 0）開始讀，worker 第一次啟動前就寫進去的事件也要處理
import type { Redis } from 'ioredis'

export type StreamMessage = { id: string, fields: Record<string, string> }

export type ConsumeOptions = {
  stream: string
  group: string
  consumer: string                                  // 這個 worker 的名字，例如 'w1'
  handle: (msg: StreamMessage) => Promise<void>     // 丟錯代表處理失敗
  count?: number                                    // 一次最多讀幾筆，預設 10
}

// 處理一批：
// 1. group 不存在就建立（XGROUP CREATE … 0 MKSTREAM）；已經存在時 Redis 回 BUSYGROUP 錯誤，要忽略
// 2. 用 XREADGROUP 讀最多 count 筆「還沒交給任何消費者」的新訊息（不用 BLOCK）
// 3. 逐筆呼叫 handle：成功才 XACK；失敗就不 ACK（留在 PEL 等別人接手），繼續處理下一筆，不要丟錯
// 回傳這一批讀到幾筆（沒有新訊息時是 0）
export async function consume(redis: Redis, opts: ConsumeOptions): Promise<number> {
  return 0
}
