// 練習 3：優惠碼的非同步驗證
// 問題：起始版在優惠碼每改一個字就問一次伺服器（打 LATTE10 會送出 7 個請求），
//       而且較早送出、較晚回來的舊結果會蓋掉新結果：畫面上顯示「可以使用」，其實是上一個碼的答案。
// 要求：
// - 停止輸入 delay 毫秒（預設 400）後才呼叫 check(code, { signal })；期間又有輸入就重新計時
// - 去掉前後空白後是空字串：status 為 'idle'，不呼叫 check
// - 輸入改變後（還在等計時器、或請求還沒回來），status 立刻是 'checking'，不能留著上一個碼的結果
// - check 回 true → 'valid'、false → 'invalid'、丟錯 → 'error'
// - 只有最新的輸入的結果能寫進 status；過期的請求要 abort（check 收到的 signal 會被中止）
// - effect scope 停止（元件卸載）時：清掉計時器、中止進行中的請求，之後 status 不再改變
// 提示：第 5 課的 watch ＋ onWatcherCleanup
import { onWatcherCleanup, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

export type CouponStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'error'
export type CheckCoupon = (code: string, options: { signal: AbortSignal }) => Promise<boolean>

export function useCouponCheck(code: MaybeRefOrGetter<string>, check: CheckCoupon, { delay = 400 } = {}) {
  const status = ref<CouponStatus>('idle')

  watch(() => toValue(code).trim(), value => {
    if (!value) {
      status.value = 'idle'
      return
    }
    status.value = 'checking'
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const ok = await check(value, { signal: controller.signal })
        status.value = ok ? 'valid' : 'invalid'
      } catch {
        status.value = 'error'
      }
    }, delay)
    // 輸入又改變（watch 要重跑）或 scope 停止時執行：取消還沒開始的檢查、中止進行中的請求
    onWatcherCleanup(() => {
      clearTimeout(timer)
      controller.abort()
    })
  })

  return { status }
}
