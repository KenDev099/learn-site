// 練習 1：購物車的 reducer（純函式，不用 render 就能測）
// 問題：下面的 cartReducer 直接改 state（push、quantity++）再把同一個物件回傳。React 用 Object.is 比較前後的 state，
//       參考沒變就當成沒事，畫面不會更新；action 的型別是 any，打錯字也不會報錯。
// 要求：
//   1. 把 CartAction 改成可辨識聯合型別（用 type 欄位分辨），一共六種：
//        added（product: Product）、incremented（productId）、decremented（productId）、
//        removed（productId）、cleared（沒有其他欄位）、coupon_applied（code: string）
//   2. cartReducer(state, action) 回傳下一個 state，規則：
//        added：購物車沒有這個商品 → 在最後面加一列，數量 1（productId、name、price 從 product 來）；
//               已經有 → 數量 +1
//        incremented：數量 +1　　decremented：數量 −1，數量是 1 時把那一列移除
//        數量上限是 MAX_QUANTITY（20）：已經 20 時 added、incremented 都不改變 state
//        removed：移除那一列　　cleared：清空（lines 變成 []，coupon 變成 null）
//        coupon_applied：把 coupon 設成 code；購物車是空的、code 是空字串時不改變 state
//        只要 lines 變成空的，coupon 就要一起變回 null
//   3. 不能修改傳進來的 state、action 或裡面的任何物件（測試會把它們凍結）：有變的那一層換新的物件／陣列
//   4. 沒有變的那幾列要沿用原本的物件（不要整包 structuredClone）
//   5. 「什麼都沒變」的情況（找不到那個 productId、數量已經到上限、空的購物車再清空、套用同一個折扣碼…）
//      要回傳原本的 state（同一個參考），React 才能跳過更新
//   6. switch 的 default 用 never 做窮舉檢查：之後多一種 action，沒處理就編譯不過
// 不能做的事：用 any 或型別斷言繞過；在 reducer 裡做副作用（console.log 以外的 I/O、計時器、打 API）；把總金額存進 state
import type { Product } from '../../helpers/fake-api.ts'

export type CartLine = { productId: number; name: string; price: number; quantity: number }
export type CartState = { lines: CartLine[]; coupon: string | null }

export const EMPTY_CART: CartState = { lines: [], coupon: null }
export const MAX_QUANTITY = 20

// 總金額是從 lines 算出來的衍生值，不放進 state（第 6 課）。這個函式已經寫好，不用改
export function cartTotal(state: CartState): number {
  return state.lines.reduce((sum, l) => sum + l.price * l.quantity, 0)
}

export type CartAction = any

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'added': {
      const product: Product = action.product
      const line = state.lines.find(l => l.productId === product.id)
      if (line) line.quantity++
      else state.lines.push({ productId: product.id, name: product.name, price: product.price, quantity: 1 })
      return state
    }
    case 'incremented': {
      const line = state.lines.find(l => l.productId === action.productId)
      if (line) line.quantity++
      return state
    }
    case 'decremented': {
      const line = state.lines.find(l => l.productId === action.productId)
      if (line) line.quantity--
      return state
    }
    case 'removed':
      state.lines = state.lines.filter(l => l.productId !== action.productId)
      return state
    case 'cleared':
      state.lines = []
      return state
    case 'coupon_applied':
      state.coupon = action.code
      return state
    default:
      return state
  }
}
