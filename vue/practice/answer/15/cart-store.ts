// 練習 1：購物車 store（setup store）
// 問題：點餐頁、頁首的購物車徽章、結帳頁都要用同一台購物車。起始程式已經用 defineStore 開了頭，
//       但同一個商品加兩次會變成兩列、數量算錯、小計沒寫、改數量和 $reset 都還沒做。
// 要求：
//   1. state：items（明細陣列，每一列 { id, name, price, qty }）與 orderType（here 內用／togo 外帶，預設 here）
//      所有 state 都要放進 return，Pinia 才看得到（store.$state、devtools、外掛、SSR 都靠它）
//   2. add(product)：同一個商品已經在車裡就數量加一，不要多一列；新商品 qty 從 1 開始；數量上限 20
//      新的一列是新物件 { id, name, price, qty }，不要把商品物件本身放進車裡或改它
//   3. changeQty(id, qty)：改成指定數量；qty ≤ 0 就把那一列移除；超過 20 當成 20
//   4. clear()：清空 items；setOrderType(type)：改 orderType
//   5. getter：count 是所有 qty 的總和，subtotal 是 price × qty 的總和
//   6. setup store 沒有內建 $reset()，自己寫一個：所有 state 回到初始值
//   7. 狀態都寫在 defineStore 的 setup 函式裡面，不要放在模組最外層
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Product } from '../../helpers/fake-api.ts'

export type CartItem = { id: number; name: string; price: number; qty: number }
export type OrderType = 'here' | 'togo'

const MAX_QTY = 20

export const useCartStore = defineStore('cart', () => {
  const items = ref<CartItem[]>([])
  const orderType = ref<OrderType>('here')

  const count = computed(() => items.value.reduce((sum, i) => sum + i.qty, 0))
  const subtotal = computed(() => items.value.reduce((sum, i) => sum + i.price * i.qty, 0))

  function add(product: Pick<Product, 'id' | 'name' | 'price'>) {
    const line = items.value.find(i => i.id === product.id)
    if (line) line.qty = Math.min(MAX_QTY, line.qty + 1)
    else items.value.push({ id: product.id, name: product.name, price: product.price, qty: 1 })
  }
  function changeQty(id: number, qty: number) {
    if (qty <= 0) {
      items.value = items.value.filter(i => i.id !== id)
      return
    }
    const line = items.value.find(i => i.id === id)
    if (line) line.qty = Math.min(MAX_QTY, qty)
  }
  function clear() {
    items.value = []
  }
  function setOrderType(type: OrderType) {
    orderType.value = type
  }
  function $reset() {
    items.value = []
    orderType.value = 'here'
  }

  return { items, orderType, count, subtotal, add, changeQty, clear, setOrderType, $reset }
})
