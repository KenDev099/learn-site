// 練習 2：useStampCard
// 問題：會員頁、結帳頁都要顯示「目前顧客的集點數」。起始程式只接受數字，載入一次就不管了：
//       結帳頁換了顧客（customerId 是 ref 或 getter），點數還是上一位顧客的。
// 要求：
//   1. 參數 customerId 的型別改成 MaybeRefOrGetter<number>：數字、ref、getter（() => props.customerId）都要能傳
//   2. 一建立就呼叫 api.getPoints(id) 載入；customerId 是 ref 或 getter 時，值改變就重新載入
//   3. 回傳 { points, loading, reload }：points 一開始是 null；loading 在請求進行中是 true
//   4. reload() 用「現在的」customerId 再載入一次
//   5. 回應順序不一定：只採用最新一次請求的結果（上一位顧客比較晚回來的點數不能蓋掉）
import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

export type StampApi = { getPoints(customerId: number): Promise<number> }

export function useStampCard(customerId: MaybeRefOrGetter<number>, api: StampApi) {
  const points = ref<number | null>(null)
  const loading = ref(false)
  let latest = 0

  async function load() {
    const ticket = ++latest
    loading.value = true
    try {
      const value = await api.getPoints(toValue(customerId))   // 在這裡讀：每次都拿到現在的值
      if (ticket === latest) points.value = value
    } finally {
      if (ticket === latest) loading.value = false
    }
  }

  // 在 getter 裡呼叫 toValue 才會被追蹤；傳數字時 getter 永遠回傳同一個值，只會執行 immediate 那一次
  watch(customerId as never, load, { immediate: true })

  return { points, loading, reload: load }
}
