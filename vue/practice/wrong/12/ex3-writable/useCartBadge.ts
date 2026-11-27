// 練習 3：useCartBadge
// 問題：店內點餐和外帶各有一個購物車，各自顯示品項數的小徽章。
//       起始程式把 count 寫在模組最外層，兩個購物車用的是同一個 count：店內加一杯，外帶的數字也跟著變。
// 要求：
//   1. 每次呼叫 useCartBadge() 都有自己的一份 count，從 0 開始
//   2. 回傳 { count, add, clear }：呼叫端可以直接解構，解構出來的 count 仍然是響應式的 ref
//   3. count 對外唯讀（呼叫端不能直接改 count.value），只能透過 add(n = 1) 和 clear() 修改
import { ref } from 'vue'

export function useCartBadge() {
  const count = ref(0)   // 寫在函式裡：每次呼叫一份
  function add(n = 1) {
    count.value += n
  }
  function clear() {
    count.value = 0
  }
  return { count, add, clear }
}
