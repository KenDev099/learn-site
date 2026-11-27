// 練習 2：瀏覽數計數器與批次落地
// ds:views：hash，欄位是 productId，值是累計的瀏覽數
// ds:views:flushing：落地中的暫存 hash（RENAME ds:views 而來）；sink 成功才刪掉
import type { Redis } from 'ioredis'

export const VIEWS = 'ds:views'
export const FLUSHING = 'ds:views:flushing'

export type Row = { productId: number, views: number }

export async function incrView(redis: Redis, productId: number): Promise<void> {
  await redis.hincrby(VIEWS, String(productId), 1)
}

// 把目前的計數交給 sink（例如寫進 PostgreSQL）；sink 丟錯時計數要留著，下一次一起送
// 沒有任何計數時不呼叫 sink
export async function flushViews(redis: Redis, sink: (rows: Row[]) => Promise<void>): Promise<void> {
  if (await redis.exists(FLUSHING)) await send(redis, sink)   // 上一次沒送成功的先送
  try {
    await redis.rename(VIEWS, FLUSHING)
  } catch (e) {
    if ((e as Error).message.includes('no such key')) return   // 這段時間沒有新的瀏覽
    throw e
  }
  await send(redis, sink)
}

async function send(redis: Redis, sink: (rows: Row[]) => Promise<void>): Promise<void> {
  const raw = await redis.hgetall(FLUSHING)
  const rows = Object.entries(raw).map(([productId, views]) => ({ productId: Number(productId), views: Number(views) }))
  if (rows.length) await sink(rows)   // 丟錯就停在這裡，暫存 key 留著
  await redis.del(FLUSHING)
}
