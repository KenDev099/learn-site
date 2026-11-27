// 練習 2：useStampCard
// 問題：會員頁、結帳頁都要顯示「目前顧客的集點數」。起始程式只接受數字，載入一次就不管了：
//       結帳頁換了顧客（customerId 是 ref 或 getter），點數還是上一位顧客的。
// 要求：
//   1. 參數 customerId 的型別改成 MaybeRefOrGetter<number>：數字、ref、getter（() => props.customerId）都要能傳
//   2. 一建立就呼叫 api.getPoints(id) 載入；customerId 是 ref 或 getter 時，值改變就重新載入
//   3. 回傳 { points, loading, reload }：points 一開始是 null；loading 在請求進行中是 true
//   4. reload() 用「現在的」customerId 再載入一次
//   5. 回應順序不一定：只採用最新一次請求的結果（上一位顧客比較晚回來的點數不能蓋掉）
//      舊請求先回來時也不能寫進 points，loading 要等最新的請求完成才變回 false
import { ref } from 'vue'

export type StampApi = { getPoints(customerId: number): Promise<number> }

export function useStampCard(customerId: number, api: StampApi) {
  const points = ref<number | null>(null)
  const loading = ref(false)

  async function load() {
    loading.value = true
    points.value = await api.getPoints(customerId)
    loading.value = false
  }
  load()

  return { points, loading, reload: load }
}
