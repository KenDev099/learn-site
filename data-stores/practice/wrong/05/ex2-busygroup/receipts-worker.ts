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

// 把 ['type', 'paid', 'orderId', '12'] 轉成 { type: 'paid', orderId: '12' }
function toObject(list: string[]): Record<string, string> {
  const obj: Record<string, string> = {}
  for (let i = 0; i < list.length; i += 2) obj[list[i]] = list[i + 1]
  return obj
}

// 處理一批：
// 1. group 不存在就建立（XGROUP CREATE … 0 MKSTREAM）；已經存在時 Redis 回 BUSYGROUP 錯誤，要忽略
// 2. 用 XREADGROUP 讀最多 count 筆「還沒交給任何消費者」的新訊息（不用 BLOCK）
// 3. 逐筆呼叫 handle：成功才 XACK；失敗就不 ACK（留在 PEL 等別人接手），繼續處理下一筆，不要丟錯
// 回傳這一批讀到幾筆（沒有新訊息時是 0）
export async function consume(redis: Redis, opts: ConsumeOptions): Promise<number> {
  const { stream, group, consumer, handle, count = 10 } = opts
  await redis.xgroup('CREATE', stream, group, '0', 'MKSTREAM')   // 錯：group 已存在時會丟 BUSYGROUP
  const reply = await redis.xreadgroup('GROUP', group, consumer, 'COUNT', count, 'STREAMS', stream, '>')
  if (!reply) return 0
  const [[, entries]] = reply
  for (const [id, list] of entries) {
    try {
      await handle({ id, fields: toObject(list ?? []) })
      await redis.xack(stream, group, id)
    } catch {
      // 不 ACK：訊息留在 PEL，之後由 XAUTOCLAIM 交給別人重試（練習 3）
    }
  }
  return entries.length
}
