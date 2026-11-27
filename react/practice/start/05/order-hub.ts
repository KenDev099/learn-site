// 假的訂單狀態推播（正式環境會是 WebSocket 或 SSE）。這個檔案不用改。
// hub.subscribe({ storeId, orderId }, listener)：開始收這張訂單的狀態，馬上用目前的狀態呼叫一次 listener，
//   之後每次狀態改變再呼叫；回傳「取消訂閱」的函式
// hub.emit(storeId, orderId, status)：測試用，模擬後端推播新的狀態
export type OrderState = '已接單' | '製作中' | '可取餐'
export type OrderTarget = { storeId: number; orderId: number }
type Listener = (status: OrderState) => void

export function createOrderHub() {
  const current = new Map<string, OrderState>()
  const listeners = new Map<string, Set<Listener>>()
  const key = (storeId: number, orderId: number) => `${storeId}/${orderId}`
  let subscribeCalls = 0

  return {
    subscribe({ storeId, orderId }: OrderTarget, listener: Listener): () => void {
      subscribeCalls++
      const k = key(storeId, orderId)
      const own: Listener = status => listener(status)   // 同一個 listener 訂閱兩次也算兩個
      const set = listeners.get(k) ?? new Set<Listener>()
      listeners.set(k, set.add(own))
      listener(current.get(k) ?? '已接單')
      return () => { set.delete(own) }
    },
    emit(storeId: number, orderId: number, status: OrderState) {
      const k = key(storeId, orderId)
      current.set(k, status)
      for (const l of [...(listeners.get(k) ?? [])]) l(status)
    },
    /** 目前還在訂閱的 listener 數量（全部訂單加總） */
    listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    /** subscribe 總共被呼叫幾次 */
    subscribeCalls: () => subscribeCalls,
  }
}
export type OrderHub = ReturnType<typeof createOrderHub>
