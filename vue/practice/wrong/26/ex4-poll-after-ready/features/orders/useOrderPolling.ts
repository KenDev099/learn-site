// 練習 4-1：輪詢訂單狀態（features/orders，第 17 課）
// 問題：起始版用 setInterval 每 5 秒查一次：伺服器慢的時候請求一個疊一個；切到別的分頁還在查；
//       餐點好了（ready）也不停；查詢失敗時錯誤被吞掉，畫面停在舊的狀態，客人以為還在做。
// 要求：useOrderPolling(orderId, api, { interval = 5000 }) 回傳 { order, error, retry }
//   1. 一建立就查一次 api.getOrder(orderId, { signal })，結果存進 order
//   2. 上一次請求結束之後才用 setTimeout 排下一次；任何時候最多一個請求
//   3. document.visibilityState 是 "hidden" 時不查、不留計時器；變回 "visible" 時立刻查一次
//   4. order.status 變成 "ready" 就停止：不再排下一次，移除 visibilitychange 的監聽
//   5. 查詢失敗：把錯誤存進 error（不是 Error 就用 new Error(String(值)) 包起來）。
//      這個錯誤發生在計時器裡，Vue 的錯誤處理攔不到，只能由這裡自己處理
//      retry()：清掉 error、立刻再查一次，成功後恢復每 5 秒的輪詢
//   6. 所屬的 effect scope 停止時（onScopeDispose）：清掉計時器、移除監聽、abort 進行中的請求
import { onScopeDispose, shallowRef } from 'vue'
import type { Order, ShopApi } from '../../shared/api.ts'

export function useOrderPolling(orderId: number, api: Pick<ShopApi, 'getOrder'>, { interval = 5000 }: { interval?: number } = {}) {
  const order = shallowRef<Order | null>(null)
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
      order.value = await api.getOrder(orderId, { signal: controller.signal })
      error.value = null
    } catch (e) {
      if (controller.signal.aborted) return
      // 計時器裡的錯誤 Vue 攔不到：自己存起來給畫面顯示，停在這裡等 retry()
      error.value = e instanceof Error ? e : new Error(String(e))
      return
    } finally {
      inFlight = false
    }
    if (document.visibilityState === 'visible') timer = setTimeout(check, interval)
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      clearTimeout(timer)
      timer = undefined
    } else if (!timer && !error.value) {
      check()
    }
  }

  function stop() {
    stopped = true
    clearTimeout(timer)
    timer = undefined
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  function retry() {
    error.value = null
    check()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  onScopeDispose(() => {
    stop()
    controller.abort()
  })
  check()

  return { order, error, retry }
}
