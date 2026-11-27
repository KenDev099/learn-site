// 練習 3：把篩選條件放進網址的 query string
// 問題：菜單的分類篩選存在元件的 ref 裡。分享網址給同事，對方看到的是預設分類；
//       進入商品頁再按上一頁，篩選也回到預設值。
// 用法：const category = useQueryFilter('category', { allowed: ['coffee', 'tea', 'food'], fallback: 'coffee' })
//       category.value 讀取目前的分類；category.value = 'tea' 切換分類
// 要求：
//   1. 回傳可寫的 computed，值只來自 route.query[key]，不要另外存一份本地狀態
//   2. 讀取：值在 allowed 裡才用；沒有、不合法、或同一個鍵出現好幾次（變成陣列）都回傳 fallback
//   3. 寫入：用 router.replace 換掉目前這一筆歷史紀錄（打字、切換篩選不要塞滿上一頁），
//      保留路徑和其他 query（例如 ?page=2）
import { computed, type WritableComputedRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function useQueryFilter<T extends string>(
  key: string,
  options: { allowed: readonly T[]; fallback: T },
): WritableComputedRef<T> {
  const route = useRoute()
  const router = useRouter()
  return computed({
    get() {
      const raw = route.query[key]
      return typeof raw === 'string' && (options.allowed as readonly string[]).includes(raw) ? (raw as T) : options.fallback
    },
    set(value) {
      router.replace({ path: '/menu', query: { ...route.query, [key]: value } })
    },
  })
}
