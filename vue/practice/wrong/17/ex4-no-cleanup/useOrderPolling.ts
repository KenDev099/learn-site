// 練習 4：useOrderPolling
// 問題：取餐頁每 5 秒問一次訂單狀態。起始程式用 setInterval：伺服器慢的時候請求一個疊一個；
//       客人切到別的分頁還在一直問；餐點好了（ready）也不停；離開頁面後計時器還在跑。
// 要求：useOrderPolling(orderId, api, { interval = 5000 }) 回傳 { status, error }
//   1. 一建立就查一次 api.getOrderStatus(orderId, { signal })，結果存進 status
//   2. 上一次請求結束（成功或失敗）之後，才用 setTimeout 排下一次；任何時候最多只有一個請求在進行
//   3. document.visibilityState 是 'hidden' 時不查、不留計時器；visibilitychange 變回 'visible' 時立刻查一次（已經有請求在進行就不要再送）
//   4. status 變成 'ready' 就停止：不再排下一次，也移除 visibilitychange 的監聽
//   5. 所屬的 effect scope 停止時（onScopeDispose）：清掉計時器、移除監聽、abort 進行中的請求
//   請求失敗時把錯誤存進 error，繼續輪詢；成功時 error 設回 null
import { ref, shallowRef } from 'vue'

export type OrderStatus = 'received' | 'brewing' | 'ready'
export type OrderApi = { getOrderStatus(orderId: number, opts?: { signal?: AbortSignal }): Promise<OrderStatus> }

export function useOrderPolling(orderId: number, api: OrderApi, { interval = 5000 }: { interval?: number } = {}) {
  const status = ref<OrderStatus | null>(null)
  const error = shallowRef<Error | null>(null)
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight = false
  let stopped = false

  async function check() {
    timer = undefined
    if (stopped || inFlight || document.visibilityState === 'hidden') return
    inFlight = true
    try {
      status.value = await api.getOrderStatus(orderId, { signal: controller.signal })
      error.value = null
    } catch (e) {
      if (controller.signal.aborted) return
      error.value = e instanceof Error ? e : new Error(String(e))
    } finally {
      inFlight = false
    }
    if (status.value === 'ready') return stop()
    if (!stopped && document.visibilityState === 'visible') timer = setTimeout(check, interval)
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      clearTimeout(timer)
      timer = undefined
    } else if (!timer) {
      check()
    }
  }

  function stop() {
    stopped = true
    clearTimeout(timer)
    timer = undefined
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  check()

  return { status, error }
}
