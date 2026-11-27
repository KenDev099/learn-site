// 練習 2：瀏覽數計數器與批次落地
// ds:views：hash，欄位是 productId，值是累計的瀏覽數
// ds:views:flushing：落地中的暫存 hash（RENAME ds:views 而來）；sink 成功才刪掉
import type { Redis } from 'ioredis'

export const VIEWS = 'ds:views'
export const FLUSHING = 'ds:views:flushing'

export type Row = { productId: number, views: number }

export async function incrView(redis: Redis, productId: number): Promise<void> {
  // 寫在這裡
}

// 把目前的計數交給 sink（例如寫進 PostgreSQL）；sink 丟錯時計數要留著，下一次一起送
// 沒有任何計數時不呼叫 sink
export async function flushViews(redis: Redis, sink: (rows: Row[]) => Promise<void>): Promise<void> {
  // 寫在這裡（需要的話可以自己加輔助函式）
}

