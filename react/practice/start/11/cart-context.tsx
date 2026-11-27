/*
練習 3：把購物車的 state 與 dispatch 拆成兩個 context
問題：現在 lines 和 dispatch 包在同一個物件裡，用同一個 context 提供。value 已經用 useMemo 包住了，
      但 lines 每次變動，value 還是得換新的，所以連「只需要 dispatch」的元件（菜單上每一顆「加入」按鈕）
      也跟著重新 render。菜單有 200 個商品時，加一杯拿鐵就重新 render 200 顆按鈕。
要求：
  1. 建立兩個 context：一個放 lines，一個放 dispatch；CartProvider 兩個都提供
  2. useCart() 回傳 lines；useCartDispatch() 回傳 dispatch
  3. 只呼叫 useCartDispatch() 的元件，購物車內容變了也不能重新 render
     （useReducer 回傳的 dispatch 在元件的整個生命期都是同一個函式，直接當 value）
  4. 上面沒有 CartProvider 時，兩個 hook 都要丟錯：
     Error('useCart() 必須在 <CartProvider> 之下使用')
     Error('useCartDispatch() 必須在 <CartProvider> 之下使用')
不能做的事：
  - 不能把 dispatch 再包一層物件或箭頭函式當 value（每次 render 都是新的）
  - useCartDispatch() 裡不能去讀放 lines 的那個 context
  - 不用改 cart-reducer.ts
*/
import { createContext, use, useMemo, useReducer, type Dispatch, type ReactNode } from 'react'
import { cartReducer, type CartAction, type CartLine } from './cart-reducer.ts'

type CartValue = { lines: readonly CartLine[]; dispatch: Dispatch<CartAction> }

const CartContext = createContext<CartValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, [])
  const value = useMemo(() => ({ lines, dispatch }), [lines])
  return <CartContext value={value}>{children}</CartContext>
}

export function useCart(): readonly CartLine[] {
  const cart = use(CartContext)
  if (!cart) throw new Error('useCart() 必須在 <CartProvider> 之下使用')
  return cart.lines
}

export function useCartDispatch(): Dispatch<CartAction> {
  const cart = use(CartContext)
  if (!cart) throw new Error('useCartDispatch() 必須在 <CartProvider> 之下使用')
  return cart.dispatch
}
