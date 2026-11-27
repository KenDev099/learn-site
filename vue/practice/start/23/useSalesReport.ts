// 練習 2：2 萬筆唯讀的銷售資料
// 問題：報表頁把 2 萬筆銷售紀錄放進 ref，Vue 把每一筆都包成 proxy，載入很慢、記憶體也大；
//       而且依門市篩選的 computed 每次都回傳新陣列，篩選結果明明一樣，下游的圖表也要整個重畫。
// 要求：
//   1. rows 用 shallowRef：資料只會整批換掉，不會改其中一筆，所以不需要深層響應；rows.value[0] 不能是 reactive
//   2. load(data) 整批替換 rows（不要就地修改陣列），依賴 rows 的 watch 每次 load 都要觸發一次
//   3. store 是要篩選的門市 id（null 表示全部）；filtered 是篩選後的陣列，順序和 rows 相同
//   4. 篩選結果和上一次「元素完全相同（同樣的物件、同樣的順序）」時，filtered 要回傳上一次的陣列，下游就不會重算
//   5. 不要改 Sale 型別和 useSalesReport 的回傳形狀
import { computed, ref } from 'vue'

export type Sale = { id: number; storeId: number; productId: number; amount: number; soldAt: string }

export function useSalesReport() {
  const rows = ref<Sale[]>([])
  const store = ref<number | null>(null)

  function load(data: Sale[]) {
    rows.value = data
  }

  const filtered = computed(() =>
    store.value === null ? rows.value.slice() : rows.value.filter(r => r.storeId === store.value),
  )

  return { rows, store, load, filtered }
}
