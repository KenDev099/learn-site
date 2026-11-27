// 外送平台的訂單推播：feed 會 emit('order', 訂單)、結束時 emit('closed')、斷線時 emit('error', err)
// 每一筆都要交給 handle 寫進系統，而且一次只能處理一筆（handle 會改庫存，不能同時改）
import { on, type EventEmitter } from 'node:events'

export type FeedOrder = { id: number, item: string }
type Options = { signal?: AbortSignal, handle: (order: FeedOrder) => Promise<void> }

export async function consumeOrders(feed: EventEmitter, { signal, handle }: Options): Promise<number> {
  let count = 0
  // events.on：事件先排進它自己的暫存，for await 一次拿一筆；
  // 'closed' 讓迴圈正常結束、'error' 讓它丟錯、signal 取消時丟 AbortError；
  // 不論怎麼離開迴圈（包括 handle 丟錯），它都會把自己掛的監聽器移除
  for await (const [order] of on(feed, 'order', { close: ['closed'] })) {
    // 取消之後，已經排在暫存裡的訂單還是會被交出來：每一筆開始前先檢查

    await handle(order as FeedOrder)
    count++
  }
  return count
}
