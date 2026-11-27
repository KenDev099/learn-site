// 練習 4 用到的 composable（已經寫好，不用改）：每 ms 毫秒呼叫一次 fn，所屬的 scope 停止時清除計時器
import { onScopeDispose } from 'vue'

export function useInterval(fn: () => void, ms: number) {
  const id = setInterval(fn, ms)
  onScopeDispose(() => clearInterval(id))
}
