// 錯在：useCartDispatch() 為了檢查 Provider 去讀放 lines 的 context：等於也訂閱了購物車內容
import { createContext, use, useReducer, type Dispatch, type ReactNode } from 'react'
import { cartReducer, type CartAction, type CartLine } from './cart-reducer.ts'

// 會變的（lines）和不會變的（dispatch）分開：只拿 dispatch 的元件不訂閱 lines
const CartContext = createContext<readonly CartLine[] | null>(null)
const CartDispatchContext = createContext<Dispatch<CartAction> | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, [])
  return (
    <CartContext value={lines}>
      <CartDispatchContext value={dispatch}>{children}</CartDispatchContext>
    </CartContext>
  )
}

export function useCart(): readonly CartLine[] {
  const lines = use(CartContext)
  if (!lines) throw new Error('useCart() 必須在 <CartProvider> 之下使用')
  return lines
}

export function useCartDispatch(): Dispatch<CartAction> {
  const lines = use(CartContext)
  const dispatch = use(CartDispatchContext)
  if (!lines || !dispatch) throw new Error('useCartDispatch() 必須在 <CartProvider> 之下使用')
  return dispatch
}
