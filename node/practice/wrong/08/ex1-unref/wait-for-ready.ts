// 等某一張訂單做好：外送平台的請求會呼叫這個函式，等到了才回應
import type { Order, OrderBoard } from './order-board.ts'

type Options = { signal?: AbortSignal, timeoutMs: number }

export function waitForReady(board: OrderBoard, orderId: number, { signal, timeoutMs }: Options): Promise<Order> {
  return new Promise((resolve, reject) => {
    // 一開始就取消了：abort 事件不會再發生，要自己先檢查
    if (signal?.aborted) return reject(signal.reason)

    const onReady = (order: Order) => {
      if (order.id !== orderId) return   // 別張訂單，繼續等
      cleanup()
      resolve(order)
    }
    const onAbort = () => {
      cleanup()
      reject(signal!.reason)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new DOMException(`等訂單 ${orderId} 超過 ${timeoutMs}ms`, 'TimeoutError'))
    }, timeoutMs).unref()
    // 三條路（做好、取消、逾時）都走同一個 cleanup：監聽器和計時器一次清乾淨
    function cleanup() {
      // unref 代替 clearTimeout
      board.off('ready', onReady)
      signal?.removeEventListener('abort', onAbort)
    }

    board.on('ready', onReady)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
