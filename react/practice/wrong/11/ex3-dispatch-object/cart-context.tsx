// 錯在：dispatch 包成物件 { dispatch } 當 value：每次 render 都是新物件
import { createContext, use, useReducer, type Dispatch, type ReactNode } from 'react'
import { cartReducer, type CartAction, type CartLine } from './cart-reducer.ts'

// 會變的（lines）和不會變的（dispatch）分開：只拿 dispatch 的元件不訂閱 lines
const CartContext = createContext<readonly CartLine[] | null>(null)
const CartDispatchContext = createContext<{ dispatch: Dispatch<CartAction> } | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, [])
  return (
    <CartContext value={lines}>
      <CartDispatchContext value={{ dispatch }}>{children}</CartDispatchContext>
    </CartContext>
  )
}

export function useCart(): readonly CartLine[] {
  const lines = use(CartContext)
  if (!lines) throw new Error('useCart() 必須在 <CartProvider> 之下使用')
  return lines
}

export function useCartDispatch(): Dispatch<CartAction> {
  const box = use(CartDispatchContext)
  if (!box) throw new Error('useCartDispatch() 必須在 <CartProvider> 之下使用')
  return box.dispatch
}
