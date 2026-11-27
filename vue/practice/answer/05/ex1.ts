// 練習 1：菜單搜尋（競態與取消）
// 問題：使用者打「拿」再打「拿鐵」，「拿」的請求比較慢、比較晚回來，畫面上的結果被舊回應蓋掉；
//       清空搜尋框時還會用空字串去打 API；被取消的請求也被當成錯誤顯示。
// 要求：
//   1. keyword 改變時呼叫 api.search(keyword, { signal })，signal 來自這一次的 AbortController
//   2. 新的搜尋開始（或關鍵字被清空）時，取消上一個還沒回來的請求（onWatcherCleanup 或 onCleanup）
//   3. results 只採用最新一次搜尋的結果
//   4. keyword 是空字串（去掉前後空白後）時：results 清空、不發請求
//   5. 被取消的請求不能把 error 設成錯誤；真正的錯誤（例如伺服器 500）要存進 error，results 清空
//   6. 每次開始新的搜尋時，error 先設回 null
//   7. 所屬的 effect scope 停止（例如元件卸載）時，也要取消進行中的請求
import { onWatcherCleanup, ref, watch, type Ref } from 'vue'
import type { FakeMenuApi, Product } from '../../helpers/fake-api.ts'

export function useMenuSearch(keyword: Ref<string>, api: Pick<FakeMenuApi, 'search'>) {
  const results = ref<Product[]>([])
  const error = ref<unknown>(null)

  watch(keyword, async kw => {
    error.value = null
    if (!kw.trim()) {
      results.value = []
      return
    }
    const controller = new AbortController()
    // 一定要在 await 之前登記：下一次執行（或停止）時取消這一次的請求
    onWatcherCleanup(() => controller.abort())
    try {
      results.value = await api.search(kw, { signal: controller.signal })
    } catch (e) {
      if (controller.signal.aborted) return   // 是我們自己取消的，不是錯誤
      error.value = e
      results.value = []
    }
  })

  return { results, error }
}
