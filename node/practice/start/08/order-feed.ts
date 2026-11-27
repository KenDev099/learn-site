// 外送平台的訂單推播：feed 會 emit('order', 訂單)、結束時 emit('closed')、斷線時 emit('error', err)
// 每一筆都要交給 handle 寫進系統，而且一次只能處理一筆（handle 會改庫存，不能同時改）
import type { EventEmitter } from 'node:events'

export type FeedOrder = { id: number, item: string }
type Options = { signal?: AbortSignal, handle: (order: FeedOrder) => Promise<void> }

// 問題：
// 1. 監聽器是 async 函式，emit 不會等它：一口氣來 5 筆就同時跑 5 個 handle
// 2. handle 失敗、feed 斷線、signal 取消都沒處理；監聽器也從來沒有移除
export function consumeOrders(feed: EventEmitter, { signal, handle }: Options): Promise<number> {
  return new Promise(resolve => {
    let count = 0
    feed.on('order', async (order: FeedOrder) => {
      await handle(order)
      count++
    })
    feed.on('closed', () => resolve(count))
  })
}
