// 練習 3：查訂單的處理函式（GET /orders/:id 會呼叫它）。上線幾天後記憶體只增不減，log 也出現 MaxListenersExceededWarning
import { EventEmitter } from 'node:events'

export type Order = { id: string, customer: string, items: { product: string, qty: number }[], note: string }
export type Load = (id: string, signal: AbortSignal) => Promise<Order>

// 程序要關機時會 orderEvents.emit('shutdown')：進行中的查詢全部取消（第 21 課）
export const orderEvents = new EventEmitter()

export function createHandler({ load, now = Date.now }: { load: Load, now?: () => number }) {
  const cache = new Map<string, Order>()

  return async function getOrder(id: string): Promise<Order> {
    const hit = cache.get(id)
    if (hit) return hit
    const controller = new AbortController()
    const onShutdown = () => controller.abort(new Error('伺服器關機中'))
    orderEvents.on('shutdown', onShutdown)
    const order = await load(id, controller.signal)
    cache.set(id, order)
    return order
  }
}
