// 練習 4：新訂單提示
// 問題：吧台的訂單列表（<ul>，每筆一個 <li>）有新訂單時，要捲到最新那一筆，捲動前必須讀到「已經畫上新訂單」的列表。
//       這裡用「記錄當下列表裡有幾個元素」來模擬讀 DOM。
// 要求：
// - useNewOrderNotice(listEl, orders) 回傳陣列 seen；orders 筆數變多時，push 一次 listEl.value 當下的子元素數量
// - 記到的數量要是 DOM 更新之後的：連續各新增一筆，記到 1、2、3，不能是 0、1、2
// - 同一段同步程式裡一次新增好幾筆，只記一次（批次）
// - 刪掉訂單（筆數變少）時不要記
// - orders 是 ref 陣列，新增訂單用 orders.value.push(…)
import { watch, type Ref } from 'vue'

export type Order = { id: number; item: string }

export function useNewOrderNotice(listEl: Ref<HTMLElement | null>, orders: Ref<Order[]>) {
  const seen: number[] = []
  watch(
    orders,
    () => {
      if (listEl.value) seen.push(listEl.value.children.length)
    },
    { flush: 'post' },
  )
  return seen
}
