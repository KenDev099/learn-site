// 練習 1：飲料做好了，通知店內所有平板（pub/sub）
// 頻道：READY_CHANNEL（ds:t05:ready）；訊息內容是 JSON 字串 {"orderId":12,"at":1793000000000}
// redis 是整個程式共用的連線：訂閱要另開一條連線（redis.duplicate()），不要把共用的連線拿去訂閱
import type { Redis } from 'ioredis'

export const READY_CHANNEL = 'ds:t05:ready'

export type ReadyMessage = { orderId: number, at: number }

// 發布一則「飲料做好了」，at 是毫秒時間戳（由呼叫的人傳入）；回傳 PUBLISH 的回覆：當下收到這則訊息的訂閱者數
export async function publishReady(redis: Redis, orderId: number, at: number): Promise<number> {
  return 0
}

// 訂閱 READY_CHANNEL，每收到一則就用解析好的物件呼叫 onMessage
// 回傳之前訂閱要已經生效；回傳的函式會取消訂閱並關掉這條訂閱用的連線
export async function subscribeReady(redis: Redis, onMessage: (msg: ReadyMessage) => void): Promise<() => Promise<void>> {
  // 寫在這裡
  return async () => {}
}
