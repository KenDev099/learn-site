// 等某一張訂單做好：外送平台的請求會呼叫這個函式，等到了才回應
import { once } from 'node:events'
import type { Order, OrderBoard } from './order-board.ts'

type Options = { signal?: AbortSignal, timeoutMs: number }

// 問題：
// 1. 任何一張訂單做好就 resolve，不管是不是 orderId
// 2. 沒有逾時，也不理 signal：吧台忘了做，這個請求就永遠等下去
export async function waitForReady(board: OrderBoard, orderId: number, { signal, timeoutMs }: Options): Promise<Order> {
  const [order] = await once(board, 'ready')
  return order
}
