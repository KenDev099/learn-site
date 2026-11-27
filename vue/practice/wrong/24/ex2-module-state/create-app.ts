// 練習 2：每個請求一個 app（和 cart.ts、CartPage.vue 一起改）
// 問題：renderPage 先渲染王小明（加入拿鐵）、再渲染陳美華，陳美華的頁面也出現拿鐵。
//       兩個請求同時處理時（load 裡有 await），彼此的品項和名字還會互相蓋掉。
// 要求：
//   1. createApp(owner) 每次呼叫都建立新的 app 和新的購物車（reactive），回傳 { app, cart }
//   2. 用 app.provide(CART_KEY, cart) 把購物車交給元件，不要讓元件 import 模組層級的狀態
//   3. renderPage 的流程不用改：建立 app → 等 load(cart) 放入品項 → renderToString
//   4. 不要用「每次開始時把共用的購物車清空」來解：兩個請求同時進行時還是會互相影響
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import CartPage from './CartPage.vue'
import { cart, type Cart } from './cart.ts'

export function createApp(owner: string) {
  cart.owner = owner
  const app = createSSRApp(CartPage)
  return { app, cart }
}

export async function renderPage(owner: string, load: (cart: Cart) => Promise<void>): Promise<string> {
  const { app, cart } = createApp(owner)
  await load(cart)
  return renderToString(app)
}
