// 練習 1：購物車 composable
// 問題：呼叫端寫 const { items, count, add } = useCart() 之後，add() 了好幾次，count 還是 0
// 要求：呼叫端解構之後仍然有響應性。count 要是 ref（呼叫端用 count.value 讀），items 可以是 ref 或 reactive 陣列
import { reactive, toRefs } from 'vue'

export type CartItem = { id: number; name: string; price: number }

export function useCart() {
  const state = reactive({
    items: [] as CartItem[],
    count: 0,
  })

  function add(item: CartItem) {
    state.items.push(item)
    state.count++
  }

  // toRefs：每個屬性都變成連回 state 的 ref，呼叫端解構也不會斷線
  return reactive({ items: state.items, count: state.count, add })
}
