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

export type CartAction =
  | { type: 'added'; product: Product }
  | { type: 'incremented'; productId: number }
  | { type: 'decremented'; productId: number }
  | { type: 'removed'; productId: number }
  | { type: 'cleared' }
  | { type: 'coupon_applied'; code: string }

// 「購物車空了，折扣碼就要清掉」只寫在這裡：每個會改 lines 的 action 都經過它
function withLines(state: CartState, lines: CartLine[]): CartState {
  return { lines, coupon: lines.length > 0 ? state.coupon : null }
}

function changeQuantity(state: CartState, productId: number, delta: 1 | -1): CartState {
  const line = state.lines.find(l => l.productId === productId)
  if (!line) return state
  const quantity = line.quantity + delta
  if (quantity > MAX_QUANTITY) return state
  if (quantity < 1) return withLines(state, state.lines.filter(l => l !== line))
  // 只有這一列換成新的物件，其他列沿用原本的
  return withLines(state, state.lines.map(l => (l === line ? { ...l, quantity } : l)))
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'added': {
      const { id, name, price } = action.product
      if (state.lines.some(l => l.productId === id)) return changeQuantity(state, id, 1)
      state.lines.push({ productId: id, name, price, quantity: 1 })
      return { ...state }
    }
    case 'incremented':
      return changeQuantity(state, action.productId, 1)
    case 'decremented':
      return changeQuantity(state, action.productId, -1)
    case 'removed':
      if (!state.lines.some(l => l.productId === action.productId)) return state
      return withLines(state, state.lines.filter(l => l.productId !== action.productId))
    case 'cleared':
      return state.lines.length > 0 ? { lines: [], coupon: null } : state
    case 'coupon_applied':
      if (action.code === '' || state.lines.length === 0 || state.coupon === action.code) return state
      return { ...state, coupon: action.code }
    default: {
      // 窮舉檢查：每一種 action 都處理了，這裡的 action 就是 never；之後多一種沒處理，這一行會報錯
      const _exhaustive: never = action
      return state
    }
  }
}
