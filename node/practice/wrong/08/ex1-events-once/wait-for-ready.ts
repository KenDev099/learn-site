// 錯誤：用 events.once 迴圈加 AbortSignal.any；取消和逾時都變成 AbortError，不是 signal.reason／TimeoutError
import { once } from 'node:events'
import type { Order, OrderBoard } from './order-board.ts'

type Options = { signal?: AbortSignal, timeoutMs: number }

export async function waitForReady(board: OrderBoard, orderId: number, { signal, timeoutMs }: Options): Promise<Order> {
  const s = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])])
  while (true) {
    const [order] = await once(board, 'ready', { signal: s })
    if (order.id === orderId) return order
  }
}
