// 錯在：用箭頭函式包一層 dispatch 當 value：每次 render 都是新函式
import { createContext, use, useReducer, type Dispatch, type ReactNode } from 'react'
import { cartReducer, type CartAction, type CartLine } from './cart-reducer.ts'

// 會變的（lines）和不會變的（dispatch）分開：只拿 dispatch 的元件不訂閱 lines
const CartContext = createContext<readonly CartLine[] | null>(null)
const CartDispatchContext = createContext<Dispatch<CartAction> | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, [])
  return (
    <CartContext value={lines}>
      <CartDispatchContext value={action => dispatch(action)}>{children}</CartDispatchContext>
    </CartContext>
  )
}

export function useCart(): readonly CartLine[] {
  const lines = use(CartContext)
  if (!lines) throw new Error('useCart() 必須在 <CartProvider> 之下使用')
  return lines
}

export function useCartDispatch(): Dispatch<CartAction> {
  const dispatch = use(CartDispatchContext)
  if (!dispatch) throw new Error('useCartDispatch() 必須在 <CartProvider> 之下使用')
  return dispatch
}
