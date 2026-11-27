// 練習 1 要測的程式（這個檔不用改）：飲料做好時傳簡訊通知客人
// 立刻查第一次，之後每 30 秒查一次訂單狀態：
// - 變成 'ready'：傳一次簡訊，回傳 true
// - 查詢丟錯：這一輪跳過，下一輪再查
// - 從開始算滿 10 分鐘還沒 ready：呼叫 log.warn，回傳 false，不再查
export type OrderStatus = 'pending' | 'ready'
export type NotifyDeps = {
  getStatus: (orderId: number) => Promise<OrderStatus>
  sendSms: (orderId: number) => Promise<void>
  log: { warn: (message: string) => void }
}

export const INTERVAL_MS = 30_000
export const GIVE_UP_MS = 10 * 60_000

export async function notifyWhenReady(orderId: number, deps: NotifyDeps): Promise<boolean> {
  const start = Date.now()
  while (true) {
    try {
      if (await deps.getStatus(orderId) === 'ready') {
        await deps.sendSms(orderId)
        return true
      }
    } catch {
      // 查詢失敗（例如網路不穩）：等下一輪再查
    }
    if (Date.now() - start >= GIVE_UP_MS) {
      deps.log.warn(`訂單 ${orderId} 等了 10 分鐘還沒好，不再通知`)
      return false
    }
    await new Promise(resolve => setTimeout(resolve, INTERVAL_MS))
  }
}
