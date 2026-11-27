// 練習 2：購物車狀態（和 create-app.ts、CartPage.vue 一起改）
// 問題：購物車是模組層級的 reactive。在瀏覽器裡一個分頁一個使用者，沒問題；
//       在伺服器上，這個模組只載入一次，所有使用者的請求共用同一台購物車。
// 要求：
//   1. 不要在模組層級建立購物車狀態
//   2. 匯出 CART_KEY（InjectionKey<Cart>），讓 create-app.ts 用 app.provide 提供、CartPage.vue 用 inject 取得
//   3. 匯出 useCart()：inject 拿到這次渲染的購物車；拿不到時丟出錯誤，說明要先 provide
import { inject, type InjectionKey } from 'vue'

export interface Cart {
  owner: string
  items: string[]
}

export const CART_KEY: InjectionKey<Cart> = Symbol('cart')

export function useCart(): Cart {
  const cart = inject(CART_KEY)
  if (!cart) throw new Error('找不到購物車：要在 createApp 裡用 app.provide(CART_KEY, cart) 提供')
  return cart
}
