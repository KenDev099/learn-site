import type { EventEmitter } from 'node:events'

export type FeedOrder = { id: number, item: string }
type Options = { signal?: AbortSignal, handle: (order: FeedOrder) => Promise<void> }

// 錯誤寫法：自己用 Promise 鏈排隊，功能都對，但結束後沒把監聽器移除
export function consumeOrders(feed: EventEmitter, { signal, handle }: Options): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0
    let chain = Promise.resolve()
    let stopped = false
    const fail = (err: unknown) => { stopped = true; reject(err) }
    if (signal?.aborted) return fail(new DOMException('aborted', 'AbortError'))
    signal?.addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError')))
    feed.on('order', (order: FeedOrder) => {
      chain = chain.then(async () => {
        if (stopped) return
        await handle(order)
        count++
      }).catch(fail)
    })
    feed.on('error', fail)
    feed.on('closed', () => { chain.then(() => resolve(count)) })
  })
}
